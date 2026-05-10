import { isPast, isFuture, parseISO } from 'date-fns'

/**
 * Checks if a date string is in the past
 * @param dateStr ISO date string to check
 * @returns boolean indicating if the date is in the past
 */
export const isDateInPast = (dateStr: string): boolean => {
    if (!dateStr) return false;
    try {
        const date = parseISO(dateStr);
        return isPast(date);
    } catch (error) {
        console.error('Error parsing date:', error);
        return false;
    }
};

/**
 * Checks if a date string is in the future or invalid
 * @param dateStr ISO date string to check
 * @returns boolean indicating if the date is in the future or invalid
 */
export const isDateInFutureOrInvalid = (dateStr: string): boolean => {
    if (!dateStr) return true;
    try {
        const date = parseISO(dateStr);
        return isFuture(date);
    } catch (error) {
        console.error('Error parsing date:', error);
        return true; // If we can't parse it, consider it invalid/future
    }
};