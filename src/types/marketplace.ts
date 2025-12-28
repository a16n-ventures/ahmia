export interface Store {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  category: string;
  location: string | null;
  contact_phone: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface StoreItem {
  id: string;
  store_id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  currency: string;
  price: number;
  discount_percent: number;
  delivery_mode: 'onsite' | 'payment_before_delivery';
  max_delivery_days: number;
  is_available: boolean;
  created_at: string;
  updated_at: string;
  store?: Store;
}

export const STORE_CATEGORIES = [
  'Electronics',
  'Fashion',
  'Home & Garden',
  'Health & Beauty',
  'Sports & Outdoors',
  'Vehicles',
  'Food & Groceries',
  'Services',
  'General'
] as const;

export const DELIVERY_MODES = {
  onsite: 'Pay on Delivery'
} as const; // , payment_before_delivery: 'Pay Before Delivery'
