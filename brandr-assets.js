// Brandr shared product asset config.
// Single source of truth for fallback imagery when a product's own database
// image_url is not set. The database (products.image_url) is always the
// preferred source; this file only supplies a placeholder until a real
// approved photo is pasted into image_url for that product. To add a real
// photo later, set products.image_url in the database - no page code needs
// to change.
window.BRANDR_ASSETS = {
  images: {
    'branded-air-fresheners': { src: '/item-fresheners.webp', alt: 'Branded air freshener' },
    'branded-microfiber-towels': { src: '/item-towels.webp', alt: 'Branded microfiber towel' },
    'referral-cards': { src: '/item-nextcard.webp', alt: 'Referral card' },
    'review-cards': { src: '/item-reviewcard.webp', alt: 'Review card' },
    'thank-you-cards': { src: '/item-card.webp', alt: 'Thank-you card' },
    'business-cards': { src: '/item-cards.webp', alt: 'Business card' },
    'key-tags': { src: '/item-keychains.webp', alt: 'Branded key tag' },
    'stickers': { src: '/item-stickers.webp', alt: 'Branded sticker' },
    'decals': { src: '/item-decals.webp', alt: 'Custom vinyl decal' },
    'branded-bag': { src: '/item-completekit.webp', alt: 'Branded customer bag' },
    'comeback-offer-card': { src: '/item-nextcard.webp', alt: 'Comeback offer card' },
    'care-instructions-card': { src: '/item-reviewcard.webp', alt: 'Care instructions card' },
    'warranty-card': { src: '/item-card.webp', alt: 'Warranty card' },
    'candy-extras': { src: '/item-stickers.webp', alt: 'Small extras' },
    'growth-cards': { src: '/item-nextcard.webp', alt: 'Growth Cards' },
    'growth-envelopes': { src: '/item-nextcard-mockup.webp', alt: 'Growth Envelopes' },
    'monthly-customer-kits': { src: '/item-completekit.webp', alt: 'Customer Bags' }
  },
  // Used when a slug has no entry above and no database image_url either.
  placeholder: { src: '/item-nextcard.webp', alt: 'Product preview coming soon' },
  // Aspect ratio used consistently for product imagery across pages, so
  // layout never shifts while an image loads.
  aspectRatio: '1 / 1'
};

// Resolve the image to show for a given product/component: database
// image_url first, then the shared fallback map, then the generic placeholder.
window.brandrResolveImage = function (slug, dbImageUrl) {
  if (dbImageUrl) return { src: dbImageUrl, alt: '' };
  var entry = window.BRANDR_ASSETS.images[slug];
  if (entry) return entry;
  return window.BRANDR_ASSETS.placeholder;
};
