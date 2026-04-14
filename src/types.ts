import type { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

export interface Discount {
  id: string;
  title: string;
  brand: string;
  category: string;
  description: string;
  newPrice: number;
  oldPrice: number;
  imageUrl: string;
  link: string;
  discountCode?: string;
  createdAt?: FirebaseFirestoreTypes.Timestamp;
  screenshotUrl?: string;
  isAd?: boolean;
  expiresAt?: FirebaseFirestoreTypes.Timestamp;
  adBadge?: string;
  status?: string;
  deleteAt?: FirebaseFirestoreTypes.Timestamp | Date;
  expiredAt?: FirebaseFirestoreTypes.Timestamp;
  errorReason?: string;
}

export interface Notification {
  id: string;
  title: string;
  body: string;
  date: string;
  read: boolean;
  discountId?: string;
  timestamp?: number;
}

export interface Brochure {
  id: string;
  storeName: string;
  title: string;
  imageUrl: string;
  validityDate: string;
  createdAt: FirebaseFirestoreTypes.Timestamp;
}

export interface PendingDiscount {
  title: string;
  brand: string;
  description?: string;
  category: string;
  link?: string;
  oldPrice?: number;
  newPrice: number;
  imageBase64: string;
  createdAt: any;
  status: 'pending';
}

export interface AdRequest {
  id?: string;
  type: 'product' | 'store';
  companyName: string;
  contactPerson: string;
  email: string;
  url: string;
  category: string;
  discountCode?: string;
  message?: string;
  createdAt: any;
  status: 'pending' | 'contacted' | 'rejected';
}
