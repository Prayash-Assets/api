import { FastifyRequest, FastifyReply } from "fastify";
import DiscountRule from "../models/DiscountRule";
import StudyGroup from "../models/StudyGroup";
import Organization from "../models/Organization";
import OrganizationMember from "../models/OrganizationMember";
import Package from "../models/Package";
import User from "../models/User";

/**
 * Discount Controller
 * Handles discount calculation, validation, and eligibility checks
 */

interface DiscountCheckQuery {
    packageId?: string;
}

interface DiscountValidateBody {
    packageId: string;
    groupId?: string;
    organizationId?: string;
}

// Calculate the best available discount for a user
export const checkAvailableDiscounts = async (
    req: FastifyRequest<{ Querystring: DiscountCheckQuery }>,
    reply: FastifyReply
) => {
    try {
        const userId = (req as any).user.id;
        const { packageId } = req.query;

        // Get user with group and org info
        const user = await User.findById(userId);
        if (!user) {
            return reply.status(404).send({ message: "User not found" });
        }

        // Get package (optional - if not provided, just check user's available discounts)
        let pkg: any = null;
        if (packageId) {
            pkg = await Package.findById(packageId);
            if (!pkg) {
                return reply.status(404).send({ message: "Package not found" });
            }

            // Check if eligibility discounts are enabled for this package
            if (!pkg.eligibilityDiscountEnabled) {
                return reply.status(200).send({
                    eligible: false,
                    reason: "This package does not qualify for group/organization discounts",
                    packageDiscount: {
                        originalPrice: pkg.originalPrice || pkg.price,
                        discountPercentage: pkg.discountPercentage || 0,
                        displayPrice: pkg.getDisplayPrice(),
                    },
                    eligibilityDiscount: null,
                    finalPrice: pkg.getDisplayPrice(),
                });
            }
        }

        // Check group discount
        let groupDiscount = null;
        const studentUser = user as any;

        if (studentUser.studyGroup) {
            const group = await StudyGroup.findById(studentUser.studyGroup);
            if (group && group.isDiscountValid()) {
                groupDiscount = {
                    type: "group",
                    sourceId: group._id,
                    sourceName: group.name,
                    memberCount: group.memberCount,
                    discountPercentage: group.discountPercentage,
                    expiresAt: group.discountExpiresAt,
                };
            }
        }

        // Check organization discount
        let orgDiscount = null;
        if (studentUser.organization) {
            const orgMember = await OrganizationMember.findOne({
                user: userId,
                organization: studentUser.organization,
                status: { $in: ["registered", "active"] },
            });

            if (orgMember) {
                const org = await Organization.findById(studentUser.organization);
                if (org && org.status === "verified") {
                    orgDiscount = {
                        type: "organization",
                        sourceId: org._id,
                        sourceName: org.name,
                        tier: org.tier,
                        discountPercentage: org.discountPercentage,
                    };
                }
            }
        }

        // Determine best discount (higher percentage wins)
        let bestDiscount = null;
        if (groupDiscount && orgDiscount) {
            bestDiscount = groupDiscount.discountPercentage >= orgDiscount.discountPercentage
                ? groupDiscount
                : orgDiscount;
        } else {
            bestDiscount = groupDiscount || orgDiscount;
        }

        // If no package provided, return just the available discounts
        if (!pkg) {
            return reply.status(200).send({
                eligible: !!bestDiscount,
                discounts: [groupDiscount, orgDiscount].filter(Boolean),
                bestDiscount: bestDiscount || null,
                reason: !bestDiscount ? "No group or organization discounts available" : "User is eligible for discounts",
            });
        }

        // Calculate final price
        const displayPrice = pkg.getDisplayPrice();
        let finalPrice = displayPrice;
        let eligibilityDiscountAmount = 0;
        let cappedAt = null;

        if (bestDiscount) {
            eligibilityDiscountAmount = displayPrice * (bestDiscount.discountPercentage / 100);
            finalPrice = displayPrice - eligibilityDiscountAmount;

            // Apply floor price cap if set
            if (pkg.minFloorPrice && finalPrice < pkg.minFloorPrice) {
                cappedAt = pkg.minFloorPrice;
                finalPrice = pkg.minFloorPrice;
                eligibilityDiscountAmount = displayPrice - finalPrice;
            }

            // Apply max additional discount cap if set
            if (pkg.maxAdditionalDiscount) {
                const maxAllowed = displayPrice * (pkg.maxAdditionalDiscount / 100);
                if (eligibilityDiscountAmount > maxAllowed) {
                    eligibilityDiscountAmount = maxAllowed;
                    finalPrice = displayPrice - eligibilityDiscountAmount;
                    cappedAt = pkg.maxAdditionalDiscount;
                }
            }
        }

        const originalPrice = pkg.originalPrice || pkg.price;
        const totalSavings = originalPrice - finalPrice;
        const totalDiscountPercentage = ((originalPrice - finalPrice) / originalPrice) * 100;

        // Format response for frontend
        let eligibilityDiscountType = "none";
        let eligibilityDiscountPercentage = 0;
        let groupInfo = undefined;
        let organizationInfo = undefined;

        if (bestDiscount?.type === "group") {
            eligibilityDiscountType = "group";
            eligibilityDiscountPercentage = bestDiscount.discountPercentage;
            groupInfo = {
                id: (bestDiscount as any).sourceId.toString(),
                name: (bestDiscount as any).sourceName,
                memberCount: (bestDiscount as any).memberCount,
            };
        } else if (bestDiscount?.type === "organization") {
            eligibilityDiscountType = "organization";
            eligibilityDiscountPercentage = bestDiscount.discountPercentage;
            organizationInfo = {
                id: (bestDiscount as any).sourceId.toString(),
                name: (bestDiscount as any).sourceName,
                tier: (bestDiscount as any).tier,
            };
        }

        return reply.status(200).send({
            hasDiscount: !!bestDiscount,
            eligibilityDiscountType,
            eligibilityDiscountPercentage,
            groupInfo,
            organizationInfo,
            packageDiscount: {
                originalPrice,
                discountPercentage: pkg.discountPercentage || 0,
                displayPrice,
            },
            eligibilityDiscount: bestDiscount ? {
                ...bestDiscount,
                discountAmount: eligibilityDiscountAmount,
                cappedAt,
            } : null,
            availableDiscounts: {
                group: groupDiscount,
                organization: orgDiscount,
            },
            calculation: {
                finalPrice,
                totalSavings,
                totalDiscountPercentage: Math.round(totalDiscountPercentage * 100) / 100,
            },
        });
    } catch (error) {
        console.error("Error checking discounts:", error);
        reply.status(500).send({ message: "Failed to check discounts", error });
    }
};

// Validate discount before payment (called just before Razorpay order creation)
export const validateDiscount = async (
    req: FastifyRequest<{ Body: DiscountValidateBody }>,
    reply: FastifyReply
) => {
    try {
        const userId = (req as any).user.id;
        const { packageId, groupId, organizationId } = req.body;

        // Get package
        const pkg = await Package.findById(packageId);
        if (!pkg) {
            return reply.status(404).send({ message: "Package not found" });
        }

        // Check if eligibility discounts are enabled
        if (!pkg.eligibilityDiscountEnabled) {
            return reply.status(200).send({
                valid: true,
                discountType: "none",
                finalPrice: pkg.getDisplayPrice(),
                message: "No eligibility discount applied",
            });
        }

        let discountType = "none";
        let discountPercentage = 0;
        let discountSource = null;
        let validationError = null;

        // Validate group discount
        if (groupId) {
            const group = await StudyGroup.findById(groupId);
            if (!group) {
                validationError = "Group not found";
            } else if (!group.members.includes(userId)) {
                validationError = "You are not a member of this group";
            } else if (!group.isEligible) {
                validationError = "Group does not meet minimum member requirement";
            } else if (group.status !== "active") {
                validationError = "Group is not active";
            } else if (group.discountExpiresAt && group.discountExpiresAt < new Date()) {
                validationError = "Group discount has expired";
            } else {
                discountType = "group";
                discountPercentage = group.discountPercentage;
                discountSource = {
                    id: group._id,
                    name: group.name,
                    memberCount: group.memberCount,
                };
            }
        }

        // Validate organization discount (if no group or group failed)
        if (organizationId && discountType === "none" && !validationError) {
            const org = await Organization.findById(organizationId);
            if (!org) {
                validationError = "Organization not found";
            } else if (org.status !== "verified") {
                validationError = "Organization is not verified";
            } else {
                const membership = await OrganizationMember.findOne({
                    user: userId,
                    organization: organizationId,
                    status: { $in: ["registered", "active"] },
                });

                if (!membership) {
                    validationError = "You are not a registered member of this organization";
                } else {
                    discountType = "organization";
                    discountPercentage = org.discountPercentage;
                    discountSource = {
                        id: org._id,
                        name: org.name,
                        tier: org.tier,
                    };
                }
            }
        }

        if (validationError) {
            return reply.status(400).send({
                valid: false,
                error: validationError,
                fallbackPrice: pkg.getDisplayPrice(),
            });
        }

        // Calculate final price
        const displayPrice = pkg.getDisplayPrice();
        let finalPrice = displayPrice;
        let eligibilityDiscountAmount = 0;
        let floorPriceApplied = false;

        if (discountPercentage > 0) {
            eligibilityDiscountAmount = displayPrice * (discountPercentage / 100);
            finalPrice = displayPrice - eligibilityDiscountAmount;

            // Apply caps
            if (pkg.minFloorPrice && finalPrice < pkg.minFloorPrice) {
                finalPrice = pkg.minFloorPrice;
                eligibilityDiscountAmount = displayPrice - finalPrice;
                floorPriceApplied = true;
            }

            if (pkg.maxAdditionalDiscount) {
                const maxAllowed = displayPrice * (pkg.maxAdditionalDiscount / 100);
                if (eligibilityDiscountAmount > maxAllowed) {
                    eligibilityDiscountAmount = maxAllowed;
                    finalPrice = displayPrice - eligibilityDiscountAmount;
                }
            }
        }

        return reply.status(200).send({
            valid: true,
            discountType,
            discountPercentage,
            discountSource,
            packageOriginalPrice: pkg.originalPrice || pkg.price,
            packageDiscountedPrice: displayPrice,
            eligibilityDiscountAmount,
            finalPrice,
            floorPriceApplied,
            validatedAt: new Date(),
        });
    } catch (error) {
        console.error("Error validating discount:", error);
        reply.status(500).send({ message: "Failed to validate discount", error });
    }
};

// Get all active discount rules (for display purposes)
export const getDiscountRules = async (
    req: FastifyRequest,
    reply: FastifyReply
) => {
    try {
        const rules = await DiscountRule.find({
            isActive: true,
            $or: [
                { expiresAt: null },
                { expiresAt: { $gt: new Date() } },
            ],
        }).sort({ type: 1, tier: 1 });

        // Group by type
        const groupRules = rules.filter(r => r.type === "group");
        const orgRules = rules.filter(r => r.type === "organization");

        return reply.status(200).send({
            group: groupRules.map(r => ({
                tier: r.tier,
                name: r.name,
                minMembers: r.minThreshold,
                maxMembers: r.maxThreshold,
                discountPercentage: r.discountPercentage,
                expiresAt: r.expiresAt,
            })),
            organization: orgRules.map(r => ({
                tier: r.tier,
                name: r.name,
                minSeats: r.minThreshold,
                maxSeats: r.maxThreshold,
                discountPercentage: r.discountPercentage,
                expiresAt: r.expiresAt,
            })),
        });
    } catch (error) {
        console.error("Error getting discount rules:", error);
        reply.status(500).send({ message: "Failed to get discount rules", error });
    }
};

// Admin: Create discount rule
export const createDiscountRule = async (
    req: FastifyRequest<{
        Body: {
            name: string;
            type: "group" | "organization";
            tier: number;
            minThreshold: number;
            maxThreshold?: number;
            discountPercentage: number;
            expiresAt?: string;
            priority?: number;
        };
    }>,
    reply: FastifyReply
) => {
    try {
        const userId = (req as any).user.id;
        const { name, type, tier, minThreshold, maxThreshold, discountPercentage, expiresAt, priority } = req.body;

        // Check for existing rule with same type and tier
        const existing = await DiscountRule.findOne({ type, tier });
        if (existing) {
            return reply.status(400).send({
                message: `A ${type} discount rule for tier ${tier} already exists`,
            });
        }

        const rule = new DiscountRule({
            name,
            type,
            tier,
            minThreshold,
            maxThreshold: maxThreshold || null,
            discountPercentage,
            expiresAt: expiresAt ? new Date(expiresAt) : null,
            priority: priority || 0,
            createdBy: userId,
        });

        await rule.save();

        return reply.status(201).send({
            message: "Discount rule created successfully",
            rule,
        });
    } catch (error) {
        console.error("Error creating discount rule:", error);
        reply.status(500).send({ message: "Failed to create discount rule", error });
    }
};

// Admin: Update discount rule
export const updateDiscountRule = async (
    req: FastifyRequest<{
        Params: { id: string };
        Body: {
            name?: string;
            minThreshold?: number;
            maxThreshold?: number;
            discountPercentage?: number;
            expiresAt?: string;
            isActive?: boolean;
            priority?: number;
        };
    }>,
    reply: FastifyReply
) => {
    try {
        const userId = (req as any).user.id;
        const { id } = req.params;
        const updates = req.body;

        const rule = await DiscountRule.findById(id);
        if (!rule) {
            return reply.status(404).send({ message: "Discount rule not found" });
        }

        // Apply updates
        if (updates.name) rule.name = updates.name;
        if (updates.minThreshold !== undefined) rule.minThreshold = updates.minThreshold;
        if (updates.maxThreshold !== undefined) rule.maxThreshold = updates.maxThreshold;
        if (updates.discountPercentage !== undefined) rule.discountPercentage = updates.discountPercentage;
        if (updates.expiresAt !== undefined) rule.expiresAt = updates.expiresAt ? new Date(updates.expiresAt) : null;
        if (updates.isActive !== undefined) rule.isActive = updates.isActive;
        if (updates.priority !== undefined) rule.priority = updates.priority;
        rule.updatedBy = userId;

        await rule.save();

        return reply.status(200).send({
            message: "Discount rule updated successfully",
            rule,
        });
    } catch (error) {
        console.error("Error updating discount rule:", error);
        reply.status(500).send({ message: "Failed to update discount rule", error });
    }
};

// Admin: Get all discount rules (including inactive)
export const getAllDiscountRules = async (
    req: FastifyRequest,
    reply: FastifyReply
) => {
    try {
        const rules = await DiscountRule.find()
            .populate("createdBy", "fullname email")
            .populate("updatedBy", "fullname email")
            .sort({ type: 1, tier: 1 });

        return reply.status(200).send({ rules });
    } catch (error) {
        console.error("Error getting all discount rules:", error);
        reply.status(500).send({ message: "Failed to get discount rules", error });
    }
};
