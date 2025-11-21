import { Router } from 'express';

const router = Router();

// Transaction routes will list blockchain transactions
// Placeholder for now

router.get('/', (_req, res) => {
    res.json({ message: 'Transaction routes - Coming soon' });
});

export default router;
