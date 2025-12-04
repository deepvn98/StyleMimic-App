import { db } from './firebase';
import { collection, addDoc, getDocs, deleteDoc, doc, query, where } from 'firebase/firestore';

// HARDCODED HASHES (Fallback for Admin/Default User)
const DEFAULT_ADMIN_HASH = "f9a8880e608f658c7344f62770267252033c467e271607a363c4687d002a2468"; // "MASTER-ADMIN-2024"
const DEFAULT_USER_HASH = "8c668b556f87425f168f1212876008892415170d10d65609424c5826f5540356"; // "STYLE-VIP-2024"

export interface LicenseEntry {
  id: string; // ID
  name: string;
  hash: string;
  createdAt: number;
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
 * FETCH: Get all licenses from Firestore
 */
export const fetchLicenses = async (): Promise<LicenseEntry[]> => {
  if (!db) return [];
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
  if (!db) return null;
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
  if (!db) return;
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
export const authenticate = async (input: string): Promise<'admin' | 'user' | null> => {
  const normalizedInput = input.trim();

  // 1. EMERGENCY FALLBACK (Always works locally)
  if (normalizedInput === "MASTER-ADMIN-2024") return 'admin';
  if (normalizedInput === "STYLE-VIP-2024") return 'user';

  try {
    const inputHash = await hashString(normalizedInput);

    // 2. Check Admin Hash (Hardcoded)
    if (inputHash === DEFAULT_ADMIN_HASH) return 'admin';
    if (inputHash === DEFAULT_USER_HASH) return 'user';

    // 3. Check Cloud Firestore
    if (db) {
        const q = query(collection(db, COLLECTION_NAME), where("hash", "==", inputHash));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
        return 'user';
        }
    }

  } catch (e) {
    console.error("Auth check failed:", e);
  }

  return null;
};