# Hedwig Backend API

Backend API for Hedwig - An AI-powered freelancer platform for African markets.

## 🚀 Features

- **Privy Authentication**: Secure authentication with Google/Apple sign-in and embedded wallets
- **Gemini 2.0 Flash AI**: Intelligent chat interface for document generation
- **Multi-chain Support**: Base, Celo, and Solana blockchain integration
- **Paycrest Integration**: Crypto-to-fiat offramp (USDC/cUSD → NGN)
- **Document Generation**: AI-powered invoice, proposal, and contract creation
- **Payment Links**: Generate shareable cryptocurrency payment links
- **Transaction Tracking**: Monitor payments across multiple chains

## 🛠️ Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js + TypeScript
- **Database**: PostgreSQL + Prisma ORM
- **AI**: Google Gemini 2.0 Flash
- **Authentication**: Privy
- **Blockchain**: viem (EVM), @solana/web3.js
- **PDF Generation**: Puppeteer + Handlebars

## 📦 Installation

1. **Clone the repository**
   ```bash
   cd hedwig-backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Fill in your `.env` file with:
   - `DATABASE_URL`: PostgreSQL connection string
   - `PRIVY_APP_ID` & `PRIVY_APP_SECRET`: From Privy dashboard
   - `GEMINI_API_KEY`: From Google AI Studio
   - `PAYCREST_API_KEY`: From Paycrest dashboard
   - Other configuration values

4. **Set up the database**
   ```bash
   npm run db:push
   npm run db:generate
   ```

5. **Run in development**
   ```bash
   npm run dev
   ```

The API will be available at `http://localhost:3000`

## 🔧 Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm start` - Run production server
- `npm run db:generate` - Generate Prisma client
- `npm run db:push` - Push schema changes to database
- `npm run db:migrate` - Run database migrations
- `npm run db:studio` - Open Prisma Studio
- `npm run lint` - Lint code with ESLint
- `npm test` - Run tests

## 📡 API Endpoints

### Authentication
- `POST /api/auth/register` - Register/login user
- `GET /api/auth/me` - Get current user

### Chat (AI)
- `POST /api/chat/message` - Send message to AI
- `GET /api/chat/conversations` - Get all conversations
- `GET /api/chat/conversations/:id` - Get specific conversation
- `DELETE /api/chat/conversations/:id` - Delete conversation

### Offramp (Paycrest)
- `GET /api/offramp/rates` - Get exchange rates
- `POST /api/offramp/verify-account` - Verify bank account
- `POST /api/offramp/create` - Create offramp order
- `GET /api/offramp/orders` - Get user's orders
- `GET /api/offramp/orders/:id` - Get order details

### Documents (Coming Soon)
- Invoice generation
- Proposal generation
- Contract generation
- Payment link creation

### Transactions (Coming Soon)
- Blockchain transaction tracking
- Payment history

### Clients & Projects (Coming Soon)
- Client management
- Project management

## 🔐 Environment Variables

See `.env.example` for all required environment variables.

### Required
- `DATABASE_URL` - PostgreSQL connection string
- `PRIVY_APP_ID` - Privy application ID
- `PRIVY_APP_SECRET` - Privy application ID secret
- `GEMINI_API_KEY` - Google Gemini API key
- `PAYCREST_API_KEY` - Paycrest API key

### Optional
- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Environment (development/production)
- `CORS_ORIGIN` - Allowed CORS origin
- `JWT_SECRET` - JWT signing secret

## 🚀 Deployment (Railway)

1. **Install Railway CLI**
   ```bash
   npm install -g @railway/cli
   ```

2. **Login to Railway**
   ```bash
   railway login
   ```

3. **Initialize project**
   ```bash
   railway init
   ```

4. **Add PostgreSQL database**
   ```bash
   railway add postgresql
   ```

5. **Set environment variables**
   ```bash
   railway variables set PRIVY_APP_ID=your_app_id
   railway variables set GEMINI_API_KEY=your_key
   # ... set all other variables
   ```

6. **Deploy**
   ```bash
   railway up
   ```

## 📊 Database Schema

The database includes the following models:
- **User**: User profiles with multi-chain wallet addresses
- **Client**: Freelancer's clients
- **Project**: Client projects
- **Document**: Invoices, proposals, contracts, payment links
- **Transaction**: Blockchain transactions
- **OfframpOrder**: Paycrest offramp orders
- **Conversation**: AI chat conversations
- **Message**: Individual chat messages

See `prisma/schema.prisma` for full details.

## 🔍 Health Check

Visit `/health` to check if the API is running:

```bash
curl http://localhost:3000/health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2025-11-18T23:00:00.000Z",
  "environment": "development"
}
```

## 📝 License

MIT

## 🤝 Support

For issues and questions, please open an issue on GitHub.
