import { format } from "date-fns"

export interface LocationDateFormat {
  code: string
  name: string
  dateFormat: string
}

export const LOCATION_FORMATS: LocationDateFormat[] = [
  { code: "US", name: "United States", dateFormat: "MM/dd/yyyy" },
  { code: "AU", name: "Australia", dateFormat: "dd/MM/yyyy" },
  { code: "GB", name: "United Kingdom", dateFormat: "dd/MM/yyyy" },
  { code: "CA", name: "Canada", dateFormat: "dd/MM/yyyy" },
  { code: "DE", name: "Germany", dateFormat: "dd.MM.yyyy" },
  { code: "FR", name: "France", dateFormat: "dd/MM/yyyy" },
  { code: "JP", name: "Japan", dateFormat: "yyyy/MM/dd" },
]

// This is the fallback function that uses localStorage
// It's used when the UserSettingsContext is not available
export const getDateFormat = (): string => {
  const savedLocation = localStorage.getItem("preferredLocation") || "US"
  const locationConfig = LOCATION_FORMATS.find(loc => loc.code === savedLocation)
  return locationConfig?.dateFormat || "MM/dd/yyyy"
}

// Helper function that accepts location as a parameter
export const getDateFormatForLocation = (locationCode: string): string => {
  const locationConfig = LOCATION_FORMATS.find(loc => loc.code === locationCode)
  return locationConfig?.dateFormat || "MM/dd/yyyy"
}

// Internal formatting function that accepts a format string
const formatDateWithFormat = (date: Date | string, dateFormat: string): string => {
  const dateObj = typeof date === 'string' ? new Date(date) : date
  
  // Convert date-fns format to manual formatting for better control
  const day = dateObj.getDate().toString().padStart(2, '0')
  const month = (dateObj.getMonth() + 1).toString().padStart(2, '0')
  const year = dateObj.getFullYear().toString()
  
  switch (dateFormat) {
    case "dd/MM/yyyy":
      return `${day}/${month}/${year}`
    case "dd.MM.yyyy":
      return `${day}.${month}.${year}`
    case "yyyy/MM/dd":
      return `${year}/${month}/${day}`
    case "MM/dd/yyyy":
    default:
      return `${month}/${day}/${year}`
  }
}

// Legacy function that uses localStorage
export const formatDateByLocation = (date: Date | string): string => {
  const dateFormat = getDateFormat()
  return formatDateWithFormat(date, dateFormat)
}

// New function that accepts location as a parameter
export const formatDateByLocationCode = (date: Date | string, locationCode: string): string => {
  const dateFormat = getDateFormatForLocation(locationCode)
  return formatDateWithFormat(date, dateFormat)
}

// Legacy function that uses localStorage
export const formatDateTimeByLocation = (date: Date | string): string => {
  const dateObj = typeof date === 'string' ? new Date(date) : date
  const formattedDate = formatDateByLocation(dateObj)
  const time = format(dateObj, "HH:mm")
  return `${formattedDate} ${time}`
}

// New function that accepts location as a parameter
export const formatDateTimeByLocationCode = (date: Date | string, locationCode: string): string => {
  const dateObj = typeof date === 'string' ? new Date(date) : date
  const formattedDate = formatDateByLocationCode(dateObj, locationCode)
  const time = format(dateObj, "HH:mm")
  return `${formattedDate} ${time}`
}