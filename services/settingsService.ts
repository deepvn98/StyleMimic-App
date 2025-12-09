import { db } from './firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const COLLECTION_NAME = 'user_settings';

/**
 * Save user's API keys to Cloud Firestore
 */
export const saveUserApiKeys = async (userId: string, apiKeys: string[]) => {
  try {
    // We use setDoc with merge: true to create or update the document
    await setDoc(doc(db, COLLECTION_NAME, userId), {
      apiKeys,
      updatedAt: Date.now()
    }, { merge: true });
  } catch (e) {
    console.error("Error saving API keys to cloud:", e);
    // Silent fail is acceptable here, user just won't have sync
  }
};

/**
 * Fetch user's API keys from Cloud Firestore
 */
export const getUserApiKeys = async (userId: string): Promise<string[]> => {
  try {
    const docRef = doc(db, COLLECTION_NAME, userId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists() && docSnap.data().apiKeys) {
      return docSnap.data().apiKeys as string[];
    }
    return [];
  } catch (e) {
    console.error("Error fetching API keys from cloud:", e);
    return [];
  }
};