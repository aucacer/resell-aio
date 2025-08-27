import { createContext, useContext, ReactNode } from 'react'
import { useUserSettings, UserSettings } from '@/hooks/use-user-settings'

interface UserSettingsContextType {
  settings: UserSettings | null | undefined
  isLoading: boolean
  currency: string
  location: string
  updateCurrency: (currency: string) => Promise<void>
  updateLocation: (location: string) => Promise<void>
}

const UserSettingsContext = createContext<UserSettingsContextType | undefined>(undefined)

export const useSettings = () => {
  const context = useContext(UserSettingsContext)
  if (!context) {
    // Return defaults when context is not available (e.g., in non-authenticated routes)
    return {
      settings: null,
      isLoading: false,
      currency: localStorage.getItem('preferredCurrency') || 'AUD',
      location: localStorage.getItem('preferredLocation') || 'AU',
      updateCurrency: async () => {},
      updateLocation: async () => {},
    }
  }
  return context
}

interface UserSettingsProviderProps {
  children: ReactNode
}

export const UserSettingsProvider = ({ children }: UserSettingsProviderProps) => {
  const { settings, isLoading, updateCurrency, updateLocation } = useUserSettings()

  const value: UserSettingsContextType = {
    settings,
    isLoading,
    currency: settings?.preferred_currency || localStorage.getItem('preferredCurrency') || 'AUD',
    location: settings?.preferred_location || localStorage.getItem('preferredLocation') || 'AU',
    updateCurrency,
    updateLocation,
  }

  return (
    <UserSettingsContext.Provider value={value}>
      {children}
    </UserSettingsContext.Provider>
  )
}