import { Router } from 'express';
import authRoutes from './auth';
import usageRoutes from './usage';
import videoRoutes from './videos';
import adminRoutes from './admin';
import ownerRoutes from './owner';
import enterpriseRoutes from './enterprise';
import tenantRoutes from './tenant';
import publicRoutes from './public';
import healthRoutes from './health';
import ugcRoutes from './ugc';

const router = Router();

router.use('/auth', authRoutes);
router.use('/usage', usageRoutes);
router.use('/videos', videoRoutes);
router.use('/admin', adminRoutes);
router.use('/owner', ownerRoutes);
router.use('/enterprise', enterpriseRoutes);
router.use('/tenant', tenantRoutes);
router.use('/public', publicRoutes);
router.use('/health', healthRoutes);
router.use('/ugc', ugcRoutes);

export default router;
