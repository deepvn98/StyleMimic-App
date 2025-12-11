import { db } from './firebase';
import { collection, addDoc, getDocs, deleteDoc, doc, query, where, updateDoc } from 'firebase/firestore';
import { WritingStructure } from '../types';

const COLLECTION_NAME = 'user_structures';

/**
 * Save a Structure to Firebase linked to a specific User ID
 */
export const saveStructureToCloud = async (userId: string, structure: WritingStructure): Promise<WritingStructure> => {
  try {
    const { id, ...dataToSave } = structure;
    
    const docRef = await addDoc(collection(db, COLLECTION_NAME), {
      ...dataToSave,
      userId: userId,
      savedAt: Date.now()
    });

    return {
      ...structure,
      id: docRef.id // Return the Cloud ID
    };
  } catch (e) {
    console.error("Error saving structure to cloud:", e);
    throw new Error("Could not save structure");
  }
};

/**
 * Update an existing Structure in Cloud
 */
export const updateStructureInCloud = async (structureId: string, updates: Partial<WritingStructure>) => {
  try {
    const docRef = doc(db, COLLECTION_NAME, structureId);
    // Remove id from updates to avoid overwriting the document ID field inside the document (redundant)
    const { id, ...cleanUpdates } = updates;
    await updateDoc(docRef, {
        ...cleanUpdates,
        savedAt: Date.now()
    });
  } catch (e) {
    console.error("Error updating structure:", e);
    throw e;
  }
};

/**
 * Get all structures belonging to a specific User ID
 */
export const getUserStructures = async (userId: string): Promise<WritingStructure[]> => {
  try {
    const q = query(collection(db, COLLECTION_NAME), where("userId", "==", userId));
    const querySnapshot = await getDocs(q);
    
    const structures: WritingStructure[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      structures.push({
        id: doc.id,
        name: data.name,
        description: data.description,
        sections: data.sections,
        userId: data.userId,
        savedAt: data.savedAt
      });
    });
    
    // Sort by newest
    return structures.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
  } catch (e) {
    console.error("Error fetching user structures:", e);
    return [];
  }
};

/**
 * Delete a structure from Cloud
 */
export const deleteStructureFromCloud = async (structureId: string) => {
  try {
    await deleteDoc(doc(db, COLLECTION_NAME, structureId));
  } catch (e) {
    console.error("Error deleting structure:", e);
    throw e;
  }
};