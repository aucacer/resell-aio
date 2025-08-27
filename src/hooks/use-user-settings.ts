import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { supabase } from "@/integrations/supabase/client"
import { useAuth } from "@/contexts/AuthContext"
import { useToast } from "@/hooks/use-toast"

export interface UserSettings {
  id?: string
  user_id: string
  preferred_currency: string
  preferred_location: string
  created_at?: string
  updated_at?: string
}

export function useUserSettings() {
  const { user } = useAuth()
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const { data: settings, isLoading, error } = useQuery({
    queryKey: ['user-settings', user?.id],
    queryFn: async () => {
      if (!user?.id) return null

      const { data, error } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', user.id)
        .single()

      if (error) {
        if (error.code === 'PGRST116') {
          // No settings found, create default settings
          const defaultSettings: Omit<UserSettings, 'id' | 'created_at' | 'updated_at'> = {
            user_id: user.id,
            preferred_currency: localStorage.getItem('preferredCurrency') || 'AUD',
            preferred_location: localStorage.getItem('preferredLocation') || 'AU',
          }

          const { data: newSettings, error: insertError } = await supabase
            .from('user_settings')
            .insert(defaultSettings)
            .select()
            .single()

          if (insertError) throw insertError
          
          // Sync to localStorage
          localStorage.setItem('preferredCurrency', newSettings.preferred_currency)
          localStorage.setItem('preferredLocation', newSettings.preferred_location)
          
          return newSettings
        }
        throw error
      }

      // Sync to localStorage for offline access
      localStorage.setItem('preferredCurrency', data.preferred_currency)
      localStorage.setItem('preferredLocation', data.preferred_location)

      return data as UserSettings
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 5, // Consider data fresh for 5 minutes
  })

  const updateSettings = useMutation({
    mutationFn: async (updates: Partial<Pick<UserSettings, 'preferred_currency' | 'preferred_location'>>) => {
      if (!user?.id) throw new Error('User not authenticated')

      const { data, error } = await supabase
        .from('user_settings')
        .update(updates)
        .eq('user_id', user.id)
        .select()
        .single()

      if (error) throw error
      return data as UserSettings
    },
    onSuccess: (data) => {
      // Update cache
      queryClient.setQueryData(['user-settings', user?.id], data)
      
      // Sync to localStorage
      if (data.preferred_currency) localStorage.setItem('preferredCurrency', data.preferred_currency)
      if (data.preferred_location) localStorage.setItem('preferredLocation', data.preferred_location)
    },
    onError: (error) => {
      console.error('Failed to update settings:', error)
      toast({
        title: "Failed to save settings",
        description: "Your preferences could not be saved. Please try again.",
        variant: "destructive",
      })
    },
  })

  return {
    settings,
    isLoading,
    error,
    updateCurrency: async (currency: string) => {
      await updateSettings.mutateAsync({ preferred_currency: currency })
      toast({
        title: "Currency saved",
        description: `Currency preference set to ${currency}`,
      })
    },
    updateLocation: async (location: string) => {
      await updateSettings.mutateAsync({ preferred_location: location })
      const LOCATIONS = [
        { code: "US", name: "United States", dateFormat: "MM/dd/yyyy" },
        { code: "AU", name: "Australia", dateFormat: "dd/MM/yyyy" },
        { code: "GB", name: "United Kingdom", dateFormat: "dd/MM/yyyy" },
        { code: "CA", name: "Canada", dateFormat: "dd/MM/yyyy" },
        { code: "DE", name: "Germany", dateFormat: "dd.MM.yyyy" },
        { code: "FR", name: "France", dateFormat: "dd/MM/yyyy" },
        { code: "JP", name: "Japan", dateFormat: "yyyy/MM/dd" },
      ]
      const selectedLocation = LOCATIONS.find(loc => loc.code === location)
      toast({
        title: "Location saved",
        description: `Location set to ${selectedLocation?.name}. Date format: ${selectedLocation?.dateFormat}`,
      })
    },
  }
}