import { getSupabase } from '../../lib/supabase'
import type { Category } from '../../types/category'
import type { Database, Json } from '../../types/database'
import type { AvailabilityStatus, Product, ProductSpecification, ProductVariant } from '../../types/product'
import type { PublicShop } from '../../types/shop'

type ProductRow = Database['public']['Tables']['products']['Row']
type CategoryRow = Database['public']['Tables']['categories']['Row']
type ProductImageRow = Database['public']['Tables']['product_images']['Row']
type ProductVariantRow = Database['public']['Tables']['product_variants']['Row']
type AvailabilityRow = Database['public']['Functions']['get_public_availability']['Returns'][number]
type PublicShopRow = Database['public']['Functions']['list_public_shops']['Returns'][number]

function throwIfError(error: { message: string } | null) {
  if (error) throw new Error(error.message)
}

type JsonObject = { [key: string]: Json | undefined }

function jsonRecords(value: Json): JsonObject[] {
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is JsonObject => entry !== null && typeof entry === 'object' && !Array.isArray(entry))
}

function mapSpecifications(value: Json): ProductSpecification[] {
  return jsonRecords(value).flatMap((entry) => {
    if (typeof entry.label !== 'string' || typeof entry.value !== 'string') return []
    return [{ label: entry.label, value: entry.value }]
  })
}

function mapCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    eyebrow: row.eyebrow ?? 'Collection',
    image: row.image_url ?? undefined,
    isActive: row.is_active,
    sortOrder: row.sort_order,
  }
}

function mapShop(row: PublicShopRow): PublicShop {
  return {
    id: row.id,
    shopName: row.shop_name,
    slug: row.slug,
    description: row.description,
    createdAt: row.created_at,
    productCount: Number(row.product_count),
    shopImageUrl: row.shop_image_url,
    shopLocationLabel: row.shop_location_label,
    latitude: row.shop_lat,
    longitude: row.shop_lng,
  }
}

function mapImage(row: ProductImageRow): string {
  if (row.image_url) return /(?:placehold\.co|placehold\.it|via\.placeholder\.com)/i.test(row.image_url) ? '' : row.image_url
  if (row.storage_path) return getSupabase().storage.from('product-images').getPublicUrl(row.storage_path).data.publicUrl
  return ''
}

function productStatus(value: boolean | undefined, isKnown: boolean): Exclude<AvailabilityStatus, 'unavailable'> {
  if (!isKnown || value === undefined) return 'unknown'
  return value ? 'available' : 'out-of-stock'
}

function mapProduct(
  row: ProductRow,
  images: ProductImageRow[],
  variants: ProductVariantRow[],
  availabilityRows: AvailabilityRow[] | null,
  availabilityKnown: boolean,
  shopsById: Map<string, PublicShop>,
): Product {
  const productAvailability = availabilityRows?.filter((item) => item.product_id === row.id) ?? []
  const availabilityByVariant = new Map(productAvailability.map((item) => [item.variant_id, item.is_available]))
  const mappedVariants: ProductVariant[] = variants
    .filter((variant) => variant.is_active)
    .map((variant) => ({
      id: variant.id,
      label: variant.option_label,
      value: variant.option_value,
      ...(variant.price_override !== null ? { price: Number(variant.price_override) } : {}),
      ...(variant.sku ? { sku: variant.sku } : {}),
      availabilityStatus: productStatus(availabilityByVariant.get(variant.id), availabilityKnown),
    }))

  let status: AvailabilityStatus
  if (mappedVariants.length) {
    if (!availabilityKnown) status = 'unknown'
    else if (mappedVariants.some((variant) => variant.availabilityStatus === 'available')) status = 'available'
    else if (mappedVariants.every((variant) => variant.availabilityStatus === 'out-of-stock')) status = 'out-of-stock'
    else status = 'unknown'
  } else {
    status = productStatus(availabilityByVariant.get(null), availabilityKnown)
  }

  const shop = row.seller_id ? shopsById.get(row.seller_id) : undefined

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    shortDescription: row.short_description,
    description: row.description,
    price: Number(row.price),
    currency: row.currency,
    categoryId: row.category_id ?? '',
    images: [...images].sort((a, b) => a.sort_order - b.sort_order).map(mapImage).filter(Boolean),
    specifications: mapSpecifications(row.specifications),
    variants: mappedVariants,
    isPublished: row.publication_status === 'published',
    availabilityStatus: status,
    isFeatured: row.is_featured,
    trackInventory: row.track_inventory,
    sellerId: row.seller_id,
    sellerName: shop?.shopName,
    sellerSlug: shop?.slug,
    createdAt: row.created_at,
  }
}

async function loadSupabaseCatalog() {
  const client = getSupabase()
  const [productResult, categoryResult, shopResult] = await Promise.all([
    client.from('products')
      .select('id, category_id, seller_id, name, slug, sku, short_description, description, price, currency, specifications, publication_status, moderation_status, stock_verification_status, is_featured, track_inventory, created_at')
      .eq('publication_status', 'published')
      .eq('moderation_status', 'approved')
      .order('created_at', { ascending: false }),
    client.from('categories')
      .select('id, parent_id, name, slug, description, eyebrow, image_url, is_active, sort_order, seo_title, seo_description, created_at, updated_at')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true }),
    client.rpc('list_public_shops'),
  ])
  throwIfError(productResult.error)
  throwIfError(categoryResult.error)

  const productRows = (productResult.data ?? []) as ProductRow[]
  const categories = (categoryResult.data ?? []).map(mapCategory)
  const shops = shopResult.error ? [] : (shopResult.data ?? []).map(mapShop)
  const shopsById = new Map(shops.map((shop) => [shop.id, shop]))
  if (productRows.length === 0) return { products: [] as Product[], categories, shops }

  const productIds = productRows.map((product) => product.id)
  const [imageResult, variantResult, availabilityResult] = await Promise.all([
    client.from('product_images')
      .select('id, product_id, image_url, storage_path, alt_text, sort_order, is_primary, created_at')
      .in('product_id', productIds)
      .order('sort_order', { ascending: true }),
    client.from('product_variants')
      .select('id, product_id, option_label, option_value, sku, price_override, attributes, is_active, sort_order, created_at, updated_at')
      .in('product_id', productIds)
      .eq('is_active', true)
      .order('sort_order', { ascending: true }),
    client.rpc('get_public_availability', { product_ids: productIds }),
  ])
  throwIfError(imageResult.error)
  throwIfError(variantResult.error)

  const images = (imageResult.data ?? []) as ProductImageRow[]
  const variants = (variantResult.data ?? []) as ProductVariantRow[]
  const availabilityRows = availabilityResult.error ? null : availabilityResult.data as AvailabilityRow[]
  const availabilityKnown = !availabilityResult.error
  const imagesByProduct = new Map<string, ProductImageRow[]>()
  const variantsByProduct = new Map<string, ProductVariantRow[]>()
  for (const image of images) imagesByProduct.set(image.product_id, [...(imagesByProduct.get(image.product_id) ?? []), image])
  for (const variant of variants) variantsByProduct.set(variant.product_id, [...(variantsByProduct.get(variant.product_id) ?? []), variant])

  return {
    products: productRows.map((product) => mapProduct(
      product,
      imagesByProduct.get(product.id) ?? [],
      variantsByProduct.get(product.id) ?? [],
      availabilityRows,
      availabilityKnown,
      shopsById,
    )),
    categories,
    shops,
  }
}

export const catalogService = {
  loadCatalog: loadSupabaseCatalog,
}
