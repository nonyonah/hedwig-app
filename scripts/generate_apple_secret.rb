require "jwt"

# Config
key_file = "/Users/macintoshhd/Downloads/AuthKey_T2VB42WH4Y.p8"
team_id = "HLSFG3ABDF" # TODO: Replace with your Apple Team ID (from Membership details)
client_id = "com.hedwig.app" # Bundle Identifier / Service ID
key_id = "T2VB42WH4Y" # From filename
validity_period = 180 # In days. Max 180 (6 months) according to Apple docs.

# Read key
private_key = OpenSSL::PKey::EC.new IO.read key_file

# Generate token
token = JWT.encode(
	{
		iss: team_id,
		iat: Time.now.to_i,
		exp: Time.now.to_i + 86400 * validity_period,
		aud: "https://appleid.apple.com",
		sub: client_id
	},
	private_key,
	"ES256",
	header_fields=
	{
		kid: key_id 
	}
)

puts "\nApple Client Secret (JWT):"
puts token
puts "\nCopy the above token to your Supabase Auth -> Apple Provider -> Secret Key"
