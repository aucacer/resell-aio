import { useEffect, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { supabase } from "@/integrations/supabase/client"
import { useToast } from "@/hooks/use-toast"
import { CheckCircle, XCircle, Loader2 } from "lucide-react"

export default function EmailConfirmation() {
  const [searchParams] = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()
  const { toast } = useToast()

  useEffect(() => {
    const handleEmailConfirmation = async () => {
      const token_hash = searchParams.get('token_hash')
      const type = searchParams.get('type')
      
      // Debug: log all URL parameters
      console.log('URL parameters:', Object.fromEntries(searchParams))
      console.log('token_hash:', token_hash)
      console.log('type:', type)
      
      // Check for session data in URL fragment (hash)
      const hash = window.location.hash
      console.log('URL hash:', hash)
      
      if (hash) {
        // Parse the hash fragment for session data
        const hashParams = new URLSearchParams(hash.substring(1)) // Remove the # symbol
        const access_token = hashParams.get('access_token')
        const refresh_token = hashParams.get('refresh_token')
        
        console.log('Hash access_token:', access_token)
        console.log('Hash refresh_token:', refresh_token)
        
        if (access_token && refresh_token) {
          // Session data found in hash - this means Supabase has already verified the email
          // and redirected here with the session
          try {
            const { data, error } = await supabase.auth.setSession({
              access_token,
              refresh_token
            })
            
            if (error) {
              setError(error.message)
            } else if (data.session) {
              setConfirmed(true)
              toast({
                title: "Email confirmed!",
                description: "Your account has been successfully verified.",
              })
              // Clean up the URL hash
              window.history.replaceState({}, document.title, window.location.pathname)
            }
          } catch (err) {
            setError('An unexpected error occurred while setting up your session')
          } finally {
            setLoading(false)
          }
          return
        }
      }
      
      // Check if this is an implicit flow (access_token in query params)
      const access_token = searchParams.get('access_token')
      if (access_token) {
        // For implicit flow, the user is already authenticated
        setConfirmed(true)
        setLoading(false)
        toast({
          title: "Email confirmed!",
          description: "Your account has been successfully verified.",
        })
        return
      }
      
      if (!token_hash || type !== 'email') {
        setError(`Invalid confirmation link. Token hash: ${token_hash}, Type: ${type}`)
        setLoading(false)
        return
      }

      try {
        const { error } = await supabase.auth.verifyOtp({
          token_hash,
          type: 'email'
        })

        if (error) {
          setError(error.message)
        } else {
          setConfirmed(true)
          toast({
            title: "Email confirmed!",
            description: "Your account has been successfully verified.",
          })
        }
      } catch (err) {
        setError('An unexpected error occurred')
      } finally {
        setLoading(false)
      }
    }

    handleEmailConfirmation()
  }, [searchParams, toast])

  const handleContinue = () => {
    navigate('/dashboard')
  }

  const handleBackToAuth = () => {
    navigate('/auth')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md bg-gradient-card shadow-card">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-primary">ResellAIO</CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          {loading && (
            <div className="space-y-4">
              <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
              <h3 className="text-lg font-semibold">Confirming your email...</h3>
              <p className="text-muted-foreground">Please wait while we verify your account.</p>
            </div>
          )}

          {!loading && confirmed && (
            <div className="space-y-4">
              <CheckCircle className="h-12 w-12 mx-auto text-green-500" />
              <h3 className="text-lg font-semibold text-green-600">Email Confirmed!</h3>
              <p className="text-muted-foreground">
                Your account has been successfully verified. You can now access all features of ResellAIO.
              </p>
              <Button onClick={handleContinue} className="w-full">
                Continue to Dashboard
              </Button>
            </div>
          )}

          {!loading && error && (
            <div className="space-y-4">
              <XCircle className="h-12 w-12 mx-auto text-red-500" />
              <h3 className="text-lg font-semibold text-red-600">Confirmation Failed</h3>
              <p className="text-muted-foreground">{error}</p>
              <div className="space-y-2">
                <Button onClick={handleBackToAuth} className="w-full">
                  Back to Sign In
                </Button>
                <p className="text-sm text-muted-foreground">
                  If you continue to have issues, please contact support.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}