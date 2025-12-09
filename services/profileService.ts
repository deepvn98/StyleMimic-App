
import { db } from './firebase';
import { collection, addDoc, getDocs, deleteDoc, doc, query, where, updateDoc } from 'firebase/firestore';
import { StyleProfile } from '../types';

const COLLECTION_NAME = 'user_profiles';

/**
 * Save a Style Profile to Firebase linked to a specific User ID (License ID)
 */
export const saveProfileToCloud = async (userId: string, profile: StyleProfile): Promise<StyleProfile | null> => {
  try {
    // We don't save the 'id' field from the object to Firestore to let Firestore generate its own,
    // OR we use the profile.id if we want to sync IDs. 
    // Let's rely on Firestore IDs for cloud operations.
    
    const { id, ...dataToSave } = profile;
    
    const docRef = await addDoc(collection(db, COLLECTION_NAME), {
      ...dataToSave,
      userId: userId, // LINK TO USER
      savedAt: Date.now()
    });

    return {
      ...profile,
      id: docRef.id // Return the Cloud ID
    };
  } catch (e) {
    console.error("Error saving profile to cloud:", e);
    throw new Error("Could not save to Cloud Library");
  }
};

/**
 * Get all profiles belonging to a specific User ID
 */
export const getUserProfiles = async (userId: string): Promise<StyleProfile[]> => {
  try {
    const q = query(collection(db, COLLECTION_NAME), where("userId", "==", userId));
    const querySnapshot = await getDocs(q);
    
    const profiles: StyleProfile[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      // Reconstruct StyleProfile object
      profiles.push({
        id: doc.id, // Use Cloud Document ID
        name: data.name,
        description: data.description,
        metrics: data.metrics,
        signaturePhrases: data.signaturePhrases,
        toneDescription: data.toneDescription,
        structurePattern: data.structurePattern,
        typicalSectionLength: data.typicalSectionLength,
        contentType: data.contentType || 'general',
        styleDNA: data.styleDNA,
        styleSamples: data.styleSamples
      });
    });
    
    return profiles;
  } catch (e) {
    console.error("Error fetching user profiles:", e);
    return [];
  }
};

/**
 * Delete a profile from Cloud
 */
export const deleteProfileFromCloud = async (profileId: string) => {
  try {
    await deleteDoc(doc(db, COLLECTION_NAME, profileId));
  } catch (e) {
    console.error("Error deleting profile:", e);
    throw e;
  }
};

/**
 * Update a profile (Rename / Move folder)
 */
export const updateProfileInCloud = async (profileId: string, updates: Partial<StyleProfile>) => {
  try {
    const docRef = doc(db, COLLECTION_NAME, profileId);
    await updateDoc(docRef, updates);
  } catch (e) {
    console.error("Error updating profile:", e);
    throw e;
  }
};