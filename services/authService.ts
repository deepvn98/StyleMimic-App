import { db } from './firebase';
import { collection, addDoc, getDocs, deleteDoc, doc, query, where, updateDoc } from 'firebase/firestore';

// HARDCODED HASHES (Fallback for Admin/Default User)
const DEFAULT_ADMIN_HASH = "f9a8880e608f658c7344f62770267252033c467e271607a363c4687d002a2468"; // "MASTER-ADMIN-2024"
const DEFAULT_USER_HASH = "8c668b556f87425f168f1212876008892415170d10d65609424c5826f5540356"; // "STYLE-VIP-2024"

// --- DEPLOYMENT CONFIGURATION ---
// Paste the code generated from Admin Panel here to update users globally
export const DEPLOYED_USER_HASHES = [
  // Example: { hash: "...", name: "Client A", createdAt: 123456 }
];

export interface LicenseEntry {
  id: string; // ID
  name: string;
  hash: string;
  createdAt: number;
}

export interface AuthResult {
  role: 'admin' | 'user' | null;
  userId?: string; // The Firestore Document ID of the license (for Cloud Library)
}

const COLLECTION_NAME = 'licenses';

/**
 * Computes SHA-256 hash
 */
export const hashString = async (input: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(input.trim());
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

/**
 * Generate a manual UUID (fallback for crypto.randomUUID compatibility)
 */
export const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

/**
 * FETCH: Get all licenses from Firestore
 */
export const fetchLicenses = async (): Promise<LicenseEntry[]> => {
  try {
    const querySnapshot = await getDocs(collection(db, COLLECTION_NAME));
    const licenses: LicenseEntry[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      licenses.push({
        id: doc.id,
        name: data.name,
        hash: data.hash,
        createdAt: data.createdAt
      });
    });
    // Sort by newest first
    return licenses.sort((a, b) => b.createdAt - a.createdAt);
  } catch (e) {
    console.error("Error fetching licenses form Cloud:", e);
    return [];
  }
};

/**
 * ADD: Save new license to Firestore
 */
export const addLicense = async (name: string, hash: string): Promise<LicenseEntry | null> => {
  try {
    const newEntry = {
      name,
      hash,
      createdAt: Date.now()
    };
    
    const docRef = await addDoc(collection(db, COLLECTION_NAME), newEntry);
    
    return {
      id: docRef.id,
      ...newEntry
    };
  } catch (e) {
    console.error("Error adding document to Cloud: ", e);
    alert("Failed to save to Cloud Database. Check console.");
    return null;
  }
};

/**
 * REMOVE: Delete license from Firestore
 */
export const removeLicense = async (id: string) => {
  try {
    await deleteDoc(doc(db, COLLECTION_NAME, id));
  } catch (e) {
    console.error("Error deleting document from Cloud: ", e);
    alert("Failed to delete from Cloud.");
    throw e;
  }
};

/**
 * AUTH: Check login against Cloud Firestore + Hardcoded
 */
export const authenticate = async (input: string): Promise<AuthResult> => {
  const normalizedInput = input.trim();

  // 1. EMERGENCY FALLBACK (Plaintext check for reliability)
  if (normalizedInput === "MASTER-ADMIN-2024") return { role: 'admin' };
  if (normalizedInput === "STYLE-VIP-2024") return { role: 'user', userId: 'demo-local-user' };

  try {
    const inputHash = await hashString(normalizedInput);

    // 2. Check Admin Hash (Hardcoded)
    if (inputHash === DEFAULT_ADMIN_HASH) return { role: 'admin' };
    if (inputHash === DEFAULT_USER_HASH) return { role: 'user', userId: 'demo-local-user' };

    // 3. Check Deployed Config (Static File)
    const staticMatch = DEPLOYED_USER_HASHES.find((u: any) => u.hash === inputHash);
    if (staticMatch) return { role: 'user', userId: 'static-user' }; // Static users use local storage for now

    // 4. Check Cloud Firestore (Real Cloud Users)
    const q = query(collection(db, COLLECTION_NAME), where("hash", "==", inputHash));
    const querySnapshot = await getDocs(q);

    if (!querySnapshot.empty) {
      // Return the Document ID as the userId. This is CRITICAL for Cloud Library.
      const docId = querySnapshot.docs[0].id; 
      return { role: 'user', userId: docId };
    }

  } catch (e) {
    console.error("Auth check failed:", e);
  }

  return { role: null };
};