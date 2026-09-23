// Brandr card preset config. Single source of truth for the 5 structured card
// types the builder can customize. Each preset maps to a real product/component
// slug already in the database (brandr_kit_components) - no pricing here, ever.
// Pricing always comes from that live data, never from this file.
window.BRANDR_CARD_PRESETS = {
  referral: {
    id: 'referral',
    componentSlug: 'referral-cards',
    name: 'Referral Card',
    purpose: 'Help customers refer someone else to your business.',
    frontFields: [
      { key: 'headline', label: 'Main headline', type: 'text', maxLen: 40, default: 'Give $25. Get $25.' },
      { key: 'body', label: 'Referral message', type: 'textarea', maxLen: 160, default: 'Refer someone to your business. They get $25 off their first service, you get $25 off your next visit.' }
    ],
    backFields: [
      { key: 'cta', label: 'Call to action', type: 'text', maxLen: 60, default: 'Send them here to get started.' },
      { key: 'qr', label: 'Referral link', type: 'url', qr: true, optional: true, default: '' },
      { key: 'code', label: 'Referral code', type: 'text', maxLen: 20, optional: true, default: '' },
      { key: 'terms', label: 'Terms', type: 'text', maxLen: 100, optional: true, default: '' }
    ]
  },
  review: {
    id: 'review',
    componentSlug: 'review-cards',
    name: 'Review Card',
    purpose: 'Send customers straight to your Google review page.',
    frontFields: [
      { key: 'thankyou', label: 'Thank-you message', type: 'text', maxLen: 60, default: 'Thanks for choosing us.' },
      { key: 'request', label: 'Review request', type: 'textarea', maxLen: 140, default: 'If you had a great experience, a quick review helps other customers find us.' }
    ],
    backFields: [
      { key: 'reviewUrl', label: 'Google review link', type: 'url', qr: true, default: '' },
      { key: 'cta', label: 'Call to action', type: 'text', maxLen: 40, default: 'Scan to leave a review' },
      { key: 'contact', label: 'Contact info', type: 'text', maxLen: 80, optional: true, default: '' }
    ]
  },
  return_offer: {
    id: 'return_offer',
    componentSlug: 'comeback-offer-card',
    name: 'Return Offer Card',
    purpose: 'Give customers a reason to book again.',
    frontFields: [
      { key: 'offer', label: 'Offer or discount', type: 'text', maxLen: 40, default: '$20 off your next visit' },
      { key: 'service', label: 'Promoted service', type: 'text', maxLen: 60, default: 'Any service' }
    ],
    backFields: [
      { key: 'expires', label: 'Expiration date', type: 'text', maxLen: 20, optional: true, default: '' },
      { key: 'code', label: 'Redemption code', type: 'text', maxLen: 20, optional: true, default: '' },
      { key: 'bookingUrl', label: 'Booking link', type: 'url', qr: true, optional: true, default: '' },
      { key: 'restrictions', label: 'Restrictions', type: 'text', maxLen: 100, optional: true, default: '' }
    ]
  },
  thank_you: {
    id: 'thank_you',
    componentSlug: 'thank-you-cards',
    name: 'Thank-You Card',
    purpose: 'Make the completed job feel more professional and memorable.',
    frontFields: [
      { key: 'headline', label: 'Thank-you headline', type: 'text', maxLen: 40, default: 'Thank you for your business.' },
      { key: 'message', label: 'Personal message', type: 'textarea', maxLen: 140, default: 'We appreciate you choosing us for the job.' }
    ],
    backFields: [
      { key: 'care', label: 'Care instructions', type: 'textarea', maxLen: 140, optional: true, default: '' },
      { key: 'contact', label: 'Contact info', type: 'text', maxLen: 80, default: '' },
      { key: 'social', label: 'Social profile', type: 'text', maxLen: 40, optional: true, default: '' },
      { key: 'qr', label: 'QR destination', type: 'url', qr: true, optional: true, default: '' }
    ]
  },
  business: {
    id: 'business',
    componentSlug: 'business-cards',
    name: 'Business Card',
    purpose: 'Make your business info easy to keep and share.',
    frontFields: [
      { key: 'name', label: 'Name', type: 'text', maxLen: 40, default: 'Your Name' },
      { key: 'title', label: 'Job title', type: 'text', maxLen: 40, optional: true, default: '' },
      { key: 'phone', label: 'Phone', type: 'text', maxLen: 20, default: '' },
      { key: 'email', label: 'Email', type: 'text', maxLen: 40, default: '' }
    ],
    backFields: [
      { key: 'website', label: 'Website', type: 'text', maxLen: 40, optional: true, default: '' },
      { key: 'social', label: 'Social profile', type: 'text', maxLen: 40, optional: true, default: '' },
      { key: 'address', label: 'Address', type: 'text', maxLen: 80, optional: true, default: '' },
      { key: 'qr', label: 'QR destination', type: 'url', qr: true, optional: true, default: '' }
    ]
  }
};

// Order presets appear in the picker.
window.BRANDR_CARD_PRESET_ORDER = ['referral', 'review', 'return_offer', 'thank_you', 'business'];

// Typography choices for the card preview. Kept within the existing Archivo
// family already loaded site-wide (no new font requests), varied by weight
// and letter-spacing rather than a different typeface.
window.BRANDR_CARD_TYPOGRAPHY = [
  { id: 'clean', label: 'Clean', style: 'font-weight:600;letter-spacing:0' },
  { id: 'bold', label: 'Bold', style: 'font-weight:800;letter-spacing:-.3px' },
  { id: 'wide', label: 'Wide', style: 'font-weight:600;letter-spacing:1.2px;text-transform:uppercase' }
];

window.BRANDR_LOGO_PLACEMENTS = [
  { id: 'top-left', label: 'Top left' },
  { id: 'top-center', label: 'Top center' },
  { id: 'top-right', label: 'Top right' },
  { id: 'center', label: 'Centered' }
];
window.BRANDR_LOGO_SIZES = ['Small', 'Medium', 'Large'];
