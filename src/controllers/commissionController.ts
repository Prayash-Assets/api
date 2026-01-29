import { FastifyRequest, FastifyReply } from "fastify";
import Commission from "../models/Commission";
import Organization from "../models/Organization";
import AuditLog from "../models/AuditLog";

/**
 * Commission Controller
 * Handles commission payout management for admin
 */

interface GetCommissionsQuery {
    status?: "pending" | "processed" | "paid" | "disputed";
    organizationId?: string;
    startDate?: string;
    endDate?: string;
    page?: string;
    limit?: string;
}

interface MarkAsPaidBody {
    transactionId?: string;
    paymentMethod?: string;
    notes?: string;
}

// Get all commissions with filters
export const getAllCommissions = async (
    req: FastifyRequest<{ Querystring: GetCommissionsQuery }>,
    reply: FastifyReply
) => {
    try {
        const { status, organizationId, startDate, endDate, page = "1", limit = "20" } = req.query;

        const query: any = {};

        // Filter by status
        if (status) {
            query.status = status;
        }

        // Filter by organization
        if (organizationId) {
            query.organization = organizationId;
        }

        // Filter by date range
        if (startDate || endDate) {
            query["period.startDate"] = {};
            if (startDate) {
                query["period.startDate"].$gte = new Date(startDate);
            }
            if (endDate) {
                query["period.startDate"].$lte = new Date(endDate);
            }
        }

        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        const [commissions, total] = await Promise.all([
            Commission.find(query)
                .populate("organization", "name type contactPerson")
                .populate("processedBy", "fullname email")
                .sort({ "period.startDate": -1, createdAt: -1 })
                .skip(skip)
                .limit(limitNum),
            Commission.countDocuments(query),
        ]);

        return reply.status(200).send({
            commissions: commissions.map(c => ({
                id: c._id,
                organization: c.organization,
                period: c.period,
                totalSales: c.totalSales,
                purchaseCount: c.purchaseCount,
                commissionRate: c.commissionRate,
                baseCommission: c.baseCommission,
                bonusCommission: c.bonusCommission,
                totalCommission: c.totalCommission,
                minimumGuarantee: c.minimumGuarantee,
                finalAmount: c.finalAmount,
                status: c.status,
                paymentDetails: c.paymentDetails,
                calculatedAt: c.calculatedAt,
                processedBy: c.processedBy,
                processedAt: c.processedAt,
                createdAt: c.createdAt,
                purchases: c.purchases,
            })),
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                pages: Math.ceil(total / limitNum),
            },
            summary: {
                totalCommissions: total,
                totalAmount: commissions.reduce((sum, c) => sum + c.finalAmount, 0),
            }
        });
    } catch (error) {
        console.error("Error getting commissions:", error);
        reply.status(500).send({ message: "Failed to get commissions", error });
    }
};

// Get commission by ID
export const getCommissionById = async (
    req: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
) => {
    try {
        const { id } = req.params;

        const commission = await Commission.findById(id)
            .populate("organization", "name type contactPerson address")
            .populate("processedBy", "fullname email")
            .populate("calculatedBy", "fullname email");

        if (!commission) {
            return reply.status(404).send({ message: "Commission record not found" });
        }

        return reply.status(200).send({
            commission: {
                id: commission._id,
                organization: commission.organization,
                period: commission.period,
                purchases: commission.purchases,
                totalSales: commission.totalSales,
                purchaseCount: commission.purchaseCount,
                commissionRate: commission.commissionRate,
                baseCommission: commission.baseCommission,
                bonusCommission: commission.bonusCommission,
                totalCommission: commission.totalCommission,
                minimumGuarantee: commission.minimumGuarantee,
                finalAmount: commission.finalAmount,
                status: commission.status,
                paymentDetails: commission.paymentDetails,
                calculatedAt: commission.calculatedAt,
                calculatedBy: commission.calculatedBy,
                processedBy: commission.processedBy,
                processedAt: commission.processedAt,
                createdAt: commission.createdAt,
                updatedAt: commission.updatedAt,
            }
        });
    } catch (error) {
        console.error("Error getting commission:", error);
        reply.status(500).send({ message: "Failed to get commission", error });
    }
};

// Mark commission as paid
export const markCommissionAsPaid = async (
    req: FastifyRequest<{
        Params: { id: string };
        Body: MarkAsPaidBody;
    }>,
    reply: FastifyReply
) => {
    try {
        const { id } = req.params;
        const { transactionId, paymentMethod, notes } = req.body;
        const adminId = (req as any).user.id;

        const commission = await Commission.findById(id);
        if (!commission) {
            return reply.status(404).send({ message: "Commission record not found" });
        }

        // Only allow marking as paid if status is processed or pending
        if (commission.status === "paid") {
            return reply.status(400).send({ message: "Commission is already marked as paid" });
        }

        // Update commission status
        commission.status = "paid";
        commission.paymentDetails = {
            transactionId: transactionId || null,
            paidAt: new Date(),
            paymentMethod: paymentMethod || null,
            notes: notes || null,
        };
        commission.processedBy = adminId;
        commission.processedAt = new Date();

        // FIXED: Update all individual payout statuses to maintain consistency
        if (commission.payouts && commission.payouts.length > 0) {
            commission.payouts = commission.payouts.map((payout: any) => ({
                ...payout.toObject ? payout.toObject() : payout,
                status: 'paid',
                paidAt: new Date(),
                transactionId: transactionId || payout.transactionId,
                paymentMethod: paymentMethod || payout.paymentMethod,
                notes: notes || payout.notes
            }));
        }

        await commission.save();

        // Create audit log
        await AuditLog.create({
            action: "COMMISSION_PAID",
            performedBy: adminId,
            organization: commission.organization, // Required field
            targetEntity: "Commission",
            targetId: commission._id,
            details: {
                organizationId: commission.organization,
                amount: commission.finalAmount,
                transactionId,
                paymentMethod,
                notes,
                period: commission.period,
            },
        });

        return reply.status(200).send({
            message: "Commission marked as paid successfully",
            commission: {
                id: commission._id,
                status: commission.status,
                paymentDetails: commission.paymentDetails,
            }
        });
    } catch (error) {
        console.error("Error marking commission as paid:", error);
        reply.status(500).send({ message: "Failed to mark commission as paid", error });
    }
};

// Get commission summary statistics
export const getCommissionSummary = async (
    req: FastifyRequest,
    reply: FastifyReply
) => {
    try {
        const [
            totalPending,
            totalProcessed,
            totalPaid,
            totalDisputed,
            pendingAmount,
            paidAmount,
        ] = await Promise.all([
            Commission.countDocuments({ status: "pending" }),
            Commission.countDocuments({ status: "processed" }),
            Commission.countDocuments({ status: "paid" }),
            Commission.countDocuments({ status: "disputed" }),
            Commission.aggregate([
                { $match: { status: { $in: ["pending", "processed"] } } },
                { $group: { _id: null, total: { $sum: "$finalAmount" } } }
            ]),
            Commission.aggregate([
                { $match: { status: "paid" } },
                { $group: { _id: null, total: { $sum: "$finalAmount" } } }
            ]),
        ]);

        return reply.status(200).send({
            summary: {
                pending: {
                    count: totalPending,
                    amount: 0,
                },
                processed: {
                    count: totalProcessed,
                    amount: 0,
                },
                paid: {
                    count: totalPaid,
                    amount: paidAmount[0]?.total || 0,
                },
                disputed: {
                    count: totalDisputed,
                    amount: 0,
                },
                totalPendingAmount: pendingAmount[0]?.total || 0,
                totalPaidAmount: paidAmount[0]?.total || 0,
            }
        });
    } catch (error) {
        console.error("Error getting commission summary:", error);
        reply.status(500).send({ message: "Failed to get commission summary", error });
    }
};

// Update commission status (for disputed or other status changes)
export const updateCommissionStatus = async (
    req: FastifyRequest<{
        Params: { id: string };
        Body: { status: "pending" | "processed" | "paid" | "disputed"; notes?: string };
    }>,
    reply: FastifyReply
) => {
    try {
        const { id } = req.params;
        const { status, notes } = req.body;
        const adminId = (req as any).user.id;

        const commission = await Commission.findById(id);
        if (!commission) {
            return reply.status(404).send({ message: "Commission record not found" });
        }

        const oldStatus = commission.status;
        commission.status = status;
        
        if (notes) {
            commission.paymentDetails = commission.paymentDetails || {};
            commission.paymentDetails.notes = notes;
        }

        commission.processedBy = adminId;
        commission.processedAt = new Date();

        await commission.save();

        // Create audit log
        await AuditLog.create({
            action: "COMMISSION_STATUS_UPDATED",
            performedBy: adminId,
            targetEntity: "Commission",
            targetId: commission._id,
            details: {
                organizationId: commission.organization,
                oldStatus,
                newStatus: status,
                notes,
            },
        });

        return reply.status(200).send({
            message: "Commission status updated successfully",
            commission: {
                id: commission._id,
                status: commission.status,
            }
        });
    } catch (error) {
        console.error("Error updating commission status:", error);
        reply.status(500).send({ message: "Failed to update commission status", error });
    }
};
