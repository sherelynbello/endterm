export interface StudentAccount {
  studentId: string;
  fullName: string;
  email: string;
  password: string;
  createdAt: string;
}

export type BookCondition = "Good" | "Fair" | "Needs Repair";

export interface LibraryBook {
  id: string;
  numericId: number;
  title: string;
  author: string;
  callNumber: string;
  genre: string;
  shelf: string;
  condition: BookCondition;
  totalCopies: number;
  availableCopies: number;
}

export type RequestType = "Borrow" | "Reserve";
export type RequestStatus = "Pending" | "Approved" | "Declined";

export interface BookRequestItem {
  id: string;
  requestCode: string;
  studentName: string;
  studentId: string;
  department: string;
  bookId: string;
  bookTitle: string;
  type: RequestType;
  status: RequestStatus;
  requestedAt: string;
  dueDate: string;
}

interface LibraryState {
  students: Map<string, StudentAccount>;
  books: Map<string, LibraryBook>;
  requests: Map<string, BookRequestItem>;
  borrowedByStudent: Map<string, Set<string>>;
  nextBookNumericId: number;
}

const globalLibrary = globalThis as typeof globalThis & {
  __jdjsLibraryState?: LibraryState;
};

const SEED_BOOKS: Omit<LibraryBook, "id">[] = [
  { numericId: 1, title: "Noli Me Tangere", author: "José Rizal", callNumber: "PQ8897.R5 N6", genre: "Filipino Literature", shelf: "Filipiniana Shelf F1", condition: "Good", totalCopies: 8, availableCopies: 5 },
  { numericId: 2, title: "El Filibusterismo", author: "José Rizal", callNumber: "PQ8897.R5 F5", genre: "Filipino Literature", shelf: "Filipiniana Shelf F1", condition: "Good", totalCopies: 7, availableCopies: 4 },
  { numericId: 3, title: "Dekada '70", author: "Lualhati Bautista", callNumber: "PL6058.9.B38 D4", genre: "Filipino Literature", shelf: "Filipiniana Shelf F2", condition: "Good", totalCopies: 5, availableCopies: 3 },
  { numericId: 4, title: "The Great Gatsby", author: "F. Scott Fitzgerald", callNumber: "PS3511.I9 G7", genre: "Classic Fiction", shelf: "Fiction Shelf C1", condition: "Good", totalCopies: 6, availableCopies: 4 },
  { numericId: 5, title: "Pride and Prejudice", author: "Jane Austen", callNumber: "PR4034 .P7", genre: "Classic Fiction", shelf: "Fiction Shelf C1", condition: "Good", totalCopies: 5, availableCopies: 5 },
  { numericId: 6, title: "To Kill a Mockingbird", author: "Harper Lee", callNumber: "PS3562.E353 T6", genre: "Classic Fiction", shelf: "Fiction Shelf C2", condition: "Fair", totalCopies: 5, availableCopies: 2 },
  { numericId: 7, title: "Dune", author: "Frank Herbert", callNumber: "PS3558.E63 D8", genre: "Science Fiction", shelf: "Fiction Shelf S1", condition: "Good", totalCopies: 5, availableCopies: 3 },
  { numericId: 8, title: "1984", author: "George Orwell", callNumber: "PR6029.R8 N5", genre: "Science Fiction", shelf: "Fiction Shelf S1", condition: "Good", totalCopies: 4, availableCopies: 3 },
  { numericId: 9, title: "Foundation", author: "Isaac Asimov", callNumber: "PS3551.S5 F6", genre: "Science Fiction", shelf: "Fiction Shelf S2", condition: "Fair", totalCopies: 4, availableCopies: 2 },
  { numericId: 10, title: "The Hobbit", author: "J.R.R. Tolkien", callNumber: "PR6039.O32 H6", genre: "Fantasy", shelf: "Fantasy Shelf A1", condition: "Good", totalCopies: 6, availableCopies: 4 },
  { numericId: 11, title: "The Name of the Wind", author: "Patrick Rothfuss", callNumber: "PS3618.O88 N3", genre: "Fantasy", shelf: "Fantasy Shelf A2", condition: "Good", totalCopies: 6, availableCopies: 4 },
  { numericId: 12, title: "Mistborn: The Final Empire", author: "Brandon Sanderson", callNumber: "PS3619.A53 M5", genre: "Fantasy", shelf: "Fantasy Shelf A2", condition: "Good", totalCopies: 5, availableCopies: 3 },
  { numericId: 13, title: "Atomic Habits", author: "James Clear", callNumber: "BF335 .C54", genre: "Self-Development", shelf: "Growth Shelf D1", condition: "Good", totalCopies: 6, availableCopies: 4 },
  { numericId: 14, title: "The Psychology of Money", author: "Morgan Housel", callNumber: "HG179 .H68", genre: "Self-Development", shelf: "Growth Shelf D1", condition: "Good", totalCopies: 4, availableCopies: 3 },
  { numericId: 15, title: "Deep Work", author: "Cal Newport", callNumber: "BF481 .N49", genre: "Self-Development", shelf: "Growth Shelf D2", condition: "Good", totalCopies: 4, availableCopies: 3 },
  { numericId: 16, title: "The Hunger Games", author: "Suzanne Collins", callNumber: "PZ7.C6837 Hu", genre: "Young Adult", shelf: "YA Shelf Y1", condition: "Good", totalCopies: 5, availableCopies: 4 },
  { numericId: 17, title: "Six of Crows", author: "Leigh Bardugo", callNumber: "PZ7.B2502 Si", genre: "Young Adult", shelf: "YA Shelf Y1", condition: "Good", totalCopies: 4, availableCopies: 3 },
  { numericId: 18, title: "The Fault in Our Stars", author: "John Green", callNumber: "PZ7.G8225 Fa", genre: "Young Adult", shelf: "YA Shelf Y2", condition: "Fair", totalCopies: 4, availableCopies: 2 },
  { numericId: 19, title: "Clean Code", author: "Robert C. Martin", callNumber: "QA76.76.D47 M36", genre: "Computer Science", shelf: "Tech Shelf T1", condition: "Good", totalCopies: 6, availableCopies: 4 },
  { numericId: 20, title: "Introduction to Algorithms", author: "Cormen, Leiserson, Rivest & Stein", callNumber: "QA76.6 .I5858", genre: "Computer Science", shelf: "Tech Shelf T1", condition: "Good", totalCopies: 6, availableCopies: 4 },
  { numericId: 21, title: "Designing Data-Intensive Applications", author: "Martin Kleppmann", callNumber: "QA76.9.D3 K54", genre: "Computer Science", shelf: "Tech Shelf T2", condition: "Good", totalCopies: 5, availableCopies: 3 },
  { numericId: 22, title: "Clean Architecture", author: "Robert C. Martin", callNumber: "QA76.76.D47 M37", genre: "Computer Science", shelf: "Tech Shelf T2", condition: "Good", totalCopies: 5, availableCopies: 4 },
  { numericId: 23, title: "The Design of Everyday Things", author: "Don Norman", callNumber: "TS171.4 .N67", genre: "Design", shelf: "Design Shelf R1", condition: "Good", totalCopies: 6, availableCopies: 4 },
  { numericId: 24, title: "Don't Make Me Think", author: "Steve Krug", callNumber: "TK5105.888 .K78", genre: "Design", shelf: "Design Shelf R1", condition: "Good", totalCopies: 5, availableCopies: 4 },
  { numericId: 25, title: "Sapiens", author: "Yuval Noah Harari", callNumber: "CB113.H43 H37", genre: "History", shelf: "History Shelf H1", condition: "Good", totalCopies: 8, availableCopies: 5 },
  { numericId: 26, title: "Educated", author: "Tara Westover", callNumber: "CT275.W474 A3", genre: "History", shelf: "History Shelf H2", condition: "Good", totalCopies: 7, availableCopies: 2 },
];

const SEED_REQUESTS: BookRequestItem[] = [
  {
    id: "req-1048",
    requestCode: "REQ-1048",
    studentName: "Andrea Mae Cruz",
    studentId: "2024-0182",
    department: "Computer Science",
    bookId: "bk-19",
    bookTitle: "Clean Code",
    type: "Borrow",
    status: "Pending",
    requestedAt: "Oct 3, 2026",
    dueDate: "",
  },
  {
    id: "req-1047",
    requestCode: "REQ-1047",
    studentName: "Miguel Santos",
    studentId: "2023-1045",
    department: "Business Administration",
    bookId: "bk-14",
    bookTitle: "The Psychology of Money",
    type: "Reserve",
    status: "Pending",
    requestedAt: "Oct 3, 2026",
    dueDate: "",
  },
  {
    id: "req-1046",
    requestCode: "REQ-1046",
    studentName: "Lara Villanueva",
    studentId: "2025-0067",
    department: "Literature",
    bookId: "bk-1",
    bookTitle: "Noli Me Tangere",
    type: "Borrow",
    status: "Approved",
    requestedAt: "Oct 2, 2026",
    dueDate: "2026-10-16",
  },
  {
    id: "req-1045",
    requestCode: "REQ-1045",
    studentName: "Joshua Lim",
    studentId: "2024-0519",
    department: "Information Technology",
    bookId: "bk-20",
    bookTitle: "Introduction to Algorithms",
    type: "Borrow",
    status: "Declined",
    requestedAt: "Oct 1, 2026",
    dueDate: "",
  },
  {
    id: "req-1044",
    requestCode: "REQ-1044",
    studentName: "Sofia Mendoza",
    studentId: "2025-0312",
    department: "Architecture",
    bookId: "bk-23",
    bookTitle: "The Design of Everyday Things",
    type: "Borrow",
    status: "Approved",
    requestedAt: "Oct 1, 2026",
    dueDate: "2026-10-15",
  },
];

function createInitialState(): LibraryState {
  const students = new Map<string, StudentAccount>();
  students.set("2026-1234", {
    studentId: "2026-1234",
    fullName: "Alex Rivera",
    email: "2026-1234@jdjs.edu",
    password: "password123",
    createdAt: "2026-08-15T08:00:00.000Z",
  });

  const books = new Map<string, LibraryBook>();
  for (const b of SEED_BOOKS) {
    const id = `bk-${b.numericId}`;
    books.set(id, { ...b, id });
  }

  const requests = new Map<string, BookRequestItem>();
  for (const r of SEED_REQUESTS) {
    requests.set(r.id, { ...r });
  }

  return {
    students,
    books,
    requests,
    borrowedByStudent: new Map<string, Set<string>>(),
    nextBookNumericId: 27,
  };
}

export function getLibraryState(): LibraryState {
  if (!globalLibrary.__jdjsLibraryState) {
    globalLibrary.__jdjsLibraryState = createInitialState();
  }
  return globalLibrary.__jdjsLibraryState;
}

export const STUDENT_ID_REGEX = /^\d{4}-\d{4}$/;

export function normalizeStudentId(value: string): string {
  return value.trim();
}
