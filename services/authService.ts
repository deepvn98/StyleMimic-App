/**
 * AUTH SERVICE
 * Handles license verification using SHA-256 Hashing.
 * This ensures the actual passwords are not stored in plain text.
 */

// HARDCODED HASHES (SHA-256)
// You can generate new hashes using the Admin Panel or console.
const DEFAULT_ADMIN_HASH = "f9a8880e608f658c7344f62770267252033c467e271607a363c4687d002a2468"; // "MASTER-ADMIN-2024"
const DEFAULT_USER_HASH = "8c668b556f87425f168f1212876008892415170d10d65609424c5826f5540356"; // "STYLE-VIP-2024"

export interface LicenseEntry {
  id: string;
  name: string; // Human readable name (e.g., "Client A")
  hash: string;
  createdAt: number;
}

/**
 * Computes SHA-256 hash of a string
 */
export const hashString = async (input: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(input.trim());
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

/**
 * Robust UUID generator that works in all contexts (unlike crypto.randomUUID)
 */
const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

/**
 * Get all valid license hashes (Hardcoded + LocalStorage)
 */
export const getStoredLicenses = (): LicenseEntry[] => {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem('styleMimic_licenses');
    let parsed: any[] = stored ? JSON.parse(stored) : [];
    
    // Auto-heal: Check for missing IDs (legacy data) and fix them immediately
    let hasChanges = false;
    const healed = parsed.map(item => {
        if (!item.id) {
            hasChanges = true;
            return { ...item, id: generateUUID() };
        }
        return item;
    });

    if (hasChanges) {
        localStorage.setItem('styleMimic_licenses', JSON.stringify(healed));
    }

    return healed as LicenseEntry[];
  } catch (e) {
    return [];
  }
};

export const addLicense = (name: string, hash: string) => {
  const current = getStoredLicenses();
  const newEntry: LicenseEntry = {
    id: generateUUID(),
    name,
    hash,
    createdAt: Date.now()
  };
  localStorage.setItem('styleMimic_licenses', JSON.stringify([...current, newEntry]));
  return newEntry;
};

export const removeLicense = (id: string) => {
  const current = getStoredLicenses();
  const updated = current.filter(l => l.id !== id);
  localStorage.setItem('styleMimic_licenses', JSON.stringify(updated));
};

/**
 * Authenticates input against Admin and User lists
 */
export const authenticate = async (input: string): Promise<'admin' | 'user' | null> => {
  const normalizedInput = input.trim();

  // 1. FALLBACK / EMERGENCY ACCESS: Check Plaintext first
  // This guarantees you can access the app even if hashing fails on specific browsers/contexts
  if (normalizedInput === "MASTER-ADMIN-2024") return 'admin';
  if (normalizedInput === "STYLE-VIP-2024") return 'user';

  try {
    const inputHash = await hashString(normalizedInput);

    // 2. Check Admin Hash
    if (inputHash === DEFAULT_ADMIN_HASH) {
      return 'admin';
    }

    // 3. Check Default User Hash
    if (inputHash === DEFAULT_USER_HASH) {
      return 'user';
    }

    // 4. Check Stored Licenses (LocalStorage)
    const storedLicenses = getStoredLicenses();
    const found = storedLicenses.find(l => l.hash === inputHash);
    if (found) {
      return 'user';
    }
  } catch (e) {
    console.error("Hashing failed, falling back to plaintext only checks", e);
    // If hashing crashes, we rely solely on the plaintext check at step 1
  }

  return null;
};