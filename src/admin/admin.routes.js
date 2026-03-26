const express = require('express');
const validate = require('../utils/validate');
const { protect, authorize } = require('../auth/auth.middleware');
const adminController = require('./admin.controller');
const { assignAgentSchema, updateAdminDecisionSchema } = require('./admin.validation');

const router = express.Router();

router.use(protect, authorize('admin'));

/**
 * @swagger
 * /api/admin/filings:
 *   get:
 *     summary: List all filings for admin monitoring
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 0
 *       - in: query
 *         name: size
 *         schema:
 *           type: integer
 *           default: 10
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [DRAFT, PENDING, ASSIGNED, IN_PROGRESS, COMPLETED, APPROVED, REJECTED]
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [patent, nonPatent]
 *       - in: query
 *         name: unassigned
 *         schema:
 *           type: boolean
 *           default: false
 *     responses:
 *       200:
 *         description: Paginated filings list
 */
router.get('/admin/filings', adminController.listAdminFilings);

/**
 * @swagger
 * /api/admin/filings/{id}/assign:
 *   patch:
 *     summary: Assign an agent to a filing
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - agentId
 *             properties:
 *               agentId:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       200:
 *         description: Filing assigned to agent
 *       404:
 *         description: Filing or agent not found
 *       422:
 *         description: Validation failed
 */
router.patch(
  '/admin/filings/:id/assign',
  validate(assignAgentSchema, { statusCode: 422, code: 'VALIDATION_ERROR' }),
  adminController.assignAgentToFiling
);

/**
 * @swagger
 * /api/admin/filings/{id}/reassign:
 *   patch:
 *     summary: Reassign a filing to a different agent
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - agentId
 *             properties:
 *               agentId:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       200:
 *         description: Filing reassigned
 *       404:
 *         description: Filing or agent not found
 *       422:
 *         description: Validation failed
 */
router.patch(
  '/admin/filings/:id/reassign',
  validate(assignAgentSchema, { statusCode: 422, code: 'VALIDATION_ERROR' }),
  adminController.reassignAgentToFiling
);

/**
 * @swagger
 * /api/admin/filings/{id}/status:
 *   patch:
 *     summary: Approve or reject a filing
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [APPROVED, REJECTED]
 *     responses:
 *       200:
 *         description: Filing status updated
 *       404:
 *         description: Filing not found
 *       422:
 *         description: Validation failed
 */
router.patch(
  '/admin/filings/:id/status',
  validate(updateAdminDecisionSchema, { statusCode: 422, code: 'VALIDATION_ERROR' }),
  adminController.setFilingDecision
);

/**
 * @swagger
 * /api/admin/agents:
 *   get:
 *     summary: List all assignable agents
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Agent list
 */
router.get('/admin/agents', adminController.listAgents);

module.exports = router;
