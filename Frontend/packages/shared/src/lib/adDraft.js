export const MAX_IMAGES = 6;

export const STEPS = [
  {
    id: "photos",
    short: "Photos",
    title: "New ad",
    heading: "Add photos",
    sub: "The first photo becomes the cover buyers see in the feed.",
    cta: "Next",
  },
  {
    id: "details",
    short: "Details",
    title: "Details",
    heading: "Describe your ad",
    sub: "A clear title and honest description get more replies.",
    cta: "Next",
  },
  {
    id: "contact",
    short: "Contact",
    title: "Contact",
    heading: "Where and how to reach you",
    sub: "Buyers only see what you choose to share here.",
    cta: "Next",
  },
  {
    id: "review",
    short: "Review",
    title: "Review",
    heading: "Check it over",
    sub: "Tap any line to jump back and change it.",
    cta: "Publish",
  },
];

export const EMPTY_DRAFT = {
  images: [],
  title: "",
  business: "",
  category: "",
  price: "",
  description: "",
  location: "",
  email: "",
  phone: "",
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Per-step validation. Returns a { field: message } map; empty means the step
 * can advance. Kept out of the component so the wizard can't advance on a
 * step it never checked.
 */
export function validateStep(stepId, draft) {
  const errors = {};

  if (stepId === "photos") {
    if (!draft.images.length) errors.images = "Add at least one photo.";
    else if (draft.images.length > MAX_IMAGES)
      errors.images = `Pick at most ${MAX_IMAGES} photos.`;
  }

  if (stepId === "details") {
    if (draft.title.trim().length < 4)
      errors.title = "Give your ad a title of at least 4 characters.";
    if (!draft.business.trim())
      errors.business = "Add the business or seller name.";
    if (!draft.category) errors.category = "Pick a category.";
    if (draft.price !== "" && !(Number(draft.price) >= 0))
      errors.price = "Price must be a positive number.";
    if (draft.description.trim().length < 20)
      errors.description = "Describe your ad in at least 20 characters.";
  }

  if (stepId === "contact") {
    if (!draft.location.trim()) errors.location = "Add a location.";
    if (!EMAIL.test(draft.email.trim()))
      errors.email = "Enter a valid email address.";
    const digits = draft.phone.replace(/\D/g, "");
    if (digits.length < 7 || digits.length > 15)
      errors.phone = "Enter a phone number with 7-15 digits.";
  }

  return errors;
}

export const stepIndex = (id) => STEPS.findIndex((s) => s.id === id);
