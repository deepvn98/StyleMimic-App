import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// --- QUAN TRỌNG: THAY THẾ BẰNG THÔNG TIN CỦA BẠN ---
// Lấy thông tin này từ Firebase Console -> Project Settings -> General -> Your Apps -> SDK Setup and Configuration
const firebaseConfig = {
  apiKey: "AIzaSyD9Ul0Yxco8Y4uVE_jgJHaVnmMCuzzdwHo",
  authDomain: "stylemimicdb.firebaseapp.com",
  projectId: "stylemimicdb",
  storageBucket: "stylemimicdb.firebasestorage.app",
  messagingSenderId: "440038810588",
  appId: "1:440038810588:web:680754d1f35368157b6519",
  measurementId: "G-YWPMPGXBXL"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore (Database)
export const db = getFirestore(app);