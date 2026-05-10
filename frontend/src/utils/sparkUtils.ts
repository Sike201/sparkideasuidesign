import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Centralized contract address for SparkIt
export const CONTRACT_ADDRESS = "SPaRKoVUfuj8FSnmbZmwAD1xP1jPEB4Vik8sgVxnJPq";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
