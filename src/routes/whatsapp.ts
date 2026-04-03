import { Router } from 'express';
import { verifyWebhook, handleWebhook } from '../controllers/whatsappController';
import { verifyWhatsAppSignature } from '../middleware/whatsappSignature';

const router = Router();

// GET - Meta webhook verification (no signature check needed)
router.get('/webhook', verifyWebhook);

// POST - Incoming messages (signature verification required)
router.post('/webhook', verifyWhatsAppSignature, handleWebhook);

export default router;
