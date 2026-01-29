import { FastifyRequest, FastifyReply } from "fastify";
import { Types } from "mongoose";
import Organization from "../models/Organization";
import OrganizationMember from "../models/OrganizationMember";
import DiscountRule from "../models/DiscountRule";
import User, { OrgAdmin, Student } from "../models/User";
import Role from "../models/Role";
import AuditLog from "../models/AuditLog";
import emailService from "../utils/emailService";
import bcrypt from "bcryptjs";

/**
 * Organization Controller
 * Handles B2B organization registration, verification, and member management
 */

interface RegisterOrgBody {
    name: string;
    type: "coaching" | "school" | "college" | "corporate";
    registrationNumber: string;
    gstin?: string;
    address?: {
        street?: string;
        city?: string;
        state?: string;
        pincode?: string;
    };
    contactPerson: {
        name: string;
        email: string;
        phone: string;
        password: string; // Password for login
    };
    seatCount: number;
}

interface AddMemberBody {
    email: string;
    name: string;
    employeeId?: string;
    department?: string;
}

interface BulkAddMembersBody {
    members: Array<{
        email: string;
        name: string;
        employeeId?: string;
        department?: string;
    }>;
}

// Helper: Generate 6-digit verification code
function generateVerificationCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// Register new organization
export const registerOrganization = async (
    req: FastifyRequest<{ Body: RegisterOrgBody }>,
    reply: FastifyReply
) => {
    try {
        const { name, type, registrationNumber, gstin, address, contactPerson, seatCount } = req.body;

        // Validate password
        if (!contactPerson.password || contactPerson.password.length < 8) {
            return reply.status(400).send({
                error: "Invalid password",
                message: "Password must be at least 8 characters long"
            });
        }

        // Check if user with this email already exists
        const existingUser = await User.findOne({ email: contactPerson.email.toLowerCase() });
        if (existingUser) {
            return reply.status(400).send({
                error: "User exists",
                message: "A user with this email already exists. Please login instead."
            });
        }

        // Check if registration number already exists
        const existingReg = await Organization.findOne({ registrationNumber: registrationNumber.trim() });
        if (existingReg) {
            return reply.status(400).send({
                error: "Registration number already exists",
                message: "An organization with this registration number is already registered"
            });
        }

        // Check if contact email already exists in organizations
        const existingOrgEmail = await Organization.findOne({
            "contactPerson.email": contactPerson.email.toLowerCase()
        });
        if (existingOrgEmail) {
            return reply.status(400).send({
                error: "Email already exists",
                message: "An organization with this contact email already exists"
            });
        }

        // Determine tier based on seat count
        const tier = await calculateOrganizationTier(seatCount);

        // DO NOT apply discount/commission defaults on registration
        // These should only be applied after:
        // 1. Admin verifies the organization
        // 2. Admin explicitly selects a discount rule
        // For now, leave as null/0 (default from schema)

        // Generate email verification code
        const verificationCode = generateVerificationCode();
        const verificationExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        // Hash the password for storage
        const hashedPassword = await bcrypt.hash(contactPerson.password, 10);

        const org = new Organization({
            name,
            type,
            registrationNumber: registrationNumber.trim(),
            gstin: gstin || null,
            address: address || { street: "", city: "", state: "", pincode: "" },
            contactPerson: {
                name: contactPerson.name,
                email: contactPerson.email.toLowerCase(),
                phone: contactPerson.phone,
            },
            seatCount,
            tier,
            // Do NOT set discount or commission defaults - let schema defaults apply (0)
            status: "pending",
            isEmailVerified: false,
            emailVerificationCode: verificationCode,
            emailVerificationExpiry: verificationExpiry,
            pendingUserPassword: hashedPassword, // Store hashed password temporarily
        });

        await org.save();

        // Log OTP for testing (remove in production)
        console.log(`📧 Organization OTP for ${contactPerson.email}: ${verificationCode}`);

        // Send OTP email
        sendOrgVerificationOTPEmail(contactPerson.email, name, verificationCode).catch(err =>
            console.error("Failed to send org verification OTP:", err)
        );

        return reply.status(201).send({
            message: "Organization registered. Please verify your email with the OTP sent.",
            requiresVerification: true,
            organization: {
                id: org._id,
                name: org.name,
                email: org.contactPerson.email,
            },
        });
    } catch (error: any) {
        console.error("Error registering organization:", error);

        // Handle duplicate key error
        if (error.code === 11000) {
            if (error.keyPattern?.registrationNumber) {
                return reply.status(400).send({
                    error: "Registration number already exists",
                    message: "An organization with this registration number is already registered"
                });
            }
            if (error.keyPattern?.["contactPerson.email"]) {
                return reply.status(400).send({
                    error: "Email already exists",
                    message: "An organization with this contact email already exists"
                });
            }
        }

        reply.status(500).send({ message: "Failed to register organization", error });
    }
};

// Verify organization email with OTP
interface VerifyOrgEmailBody {
    email: string;
    code: string;
}

export const verifyOrganizationEmail = async (
    req: FastifyRequest<{ Body: VerifyOrgEmailBody }>,
    reply: FastifyReply
) => {
    try {
        const { email, code } = req.body;

        if (!email || !code) {
            return reply.status(400).send({
                error: "Missing fields",
                message: "Email and verification code are required"
            });
        }

        const org = await Organization.findOne({
            "contactPerson.email": email.toLowerCase()
        });

        if (!org) {
            return reply.status(404).send({
                error: "Not found",
                message: "Organization not found"
            });
        }

        if (org.isEmailVerified) {
            return reply.status(400).send({
                error: "Already verified",
                message: "Email is already verified"
            });
        }

        if (!org.emailVerificationCode) {
            return reply.status(400).send({
                error: "No code",
                message: "No verification code found. Please request a new one."
            });
        }

        if (org.emailVerificationExpiry && new Date() > org.emailVerificationExpiry) {
            return reply.status(400).send({
                error: "Expired",
                message: "Verification code has expired. Please request a new one."
            });
        }

        if (org.emailVerificationCode !== code) {
            return reply.status(400).send({
                error: "Invalid code",
                message: "Invalid verification code"
            });
        }

        // Get org with password for user creation
        const orgWithPassword = await Organization.findById(org._id).select("+pendingUserPassword");

        // Create user account for the contact person as OrgAdmin
        const phoneNumber = parseInt(org.contactPerson.phone.replace(/\D/g, ''), 10) || 0;

        const newUser = new OrgAdmin({
            fullname: org.contactPerson.name,
            email: org.contactPerson.email.toLowerCase(),
            password: orgWithPassword?.pendingUserPassword, // Already hashed
            phone: phoneNumber,
            isVerified: true, // Email already verified via OTP
            organization: org._id,
        });

        await newUser.save();

        // Mark email as verified and link user
        org.isEmailVerified = true;
        org.emailVerificationCode = null;
        org.emailVerificationExpiry = null;
        org.adminUser = newUser._id as any;
        await org.save();

        // Clear the pending password from org
        await Organization.updateOne(
            { _id: org._id },
            { $unset: { pendingUserPassword: "" } }
        );

        // Send confirmation email
        sendOrgRegistrationEmail(org.contactPerson.email, org.name).catch(err =>
            console.error("Failed to send org registration email:", err)
        );

        return reply.send({
            message: "Email verified successfully! You can now login. Your organization is pending admin verification.",
            organization: {
                id: org._id,
                name: org.name,
                status: org.status,
                isEmailVerified: true,
            },
            userCreated: true,
        });
    } catch (error) {
        console.error("Error verifying organization email:", error);
        reply.status(500).send({ message: "Failed to verify email", error });
    }
};

// Resend OTP for organization
interface ResendOrgOTPBody {
    email: string;
}

export const resendOrganizationOTP = async (
    req: FastifyRequest<{ Body: ResendOrgOTPBody }>,
    reply: FastifyReply
) => {
    try {
        const { email } = req.body;

        if (!email) {
            return reply.status(400).send({
                error: "Missing email",
                message: "Email is required"
            });
        }

        const org = await Organization.findOne({
            "contactPerson.email": email.toLowerCase()
        });

        if (!org) {
            return reply.status(404).send({
                error: "Not found",
                message: "Organization not found"
            });
        }

        if (org.isEmailVerified) {
            return reply.status(400).send({
                error: "Already verified",
                message: "Email is already verified"
            });
        }

        // Generate new OTP
        const verificationCode = generateVerificationCode();
        const verificationExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        org.emailVerificationCode = verificationCode;
        org.emailVerificationExpiry = verificationExpiry;
        await org.save();

        // Send OTP email
        sendOrgVerificationOTPEmail(org.contactPerson.email, org.name, verificationCode).catch(err =>
            console.error("Failed to send org verification OTP:", err)
        );

        return reply.send({
            message: "Verification code sent to your email"
        });
    } catch (error) {
        console.error("Error resending OTP:", error);
        reply.status(500).send({ message: "Failed to resend verification code", error });
    }
};

// Get organization details (for org admin)
export const getOrganization = async (
    req: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
) => {
    try {
        const { id } = req.params;
        const userId = (req as any).user.id;

        const org = await Organization.findById(id);
        if (!org) {
            return reply.status(404).send({ message: "Organization not found" });
        }

        // Check authorization (must be org admin or system admin)
        const user = await User.findById(userId);
        const isOrgAdmin = org.adminUser?.toString() === userId;
        const isSystemAdmin = user?.userType === "Admin";

        if (!isOrgAdmin && !isSystemAdmin) {
            return reply.status(403).send({ message: "Not authorized to view this organization" });
        }

        // Get member stats
        const memberStats = await OrganizationMember.aggregate([
            { $match: { organization: org._id } },
            {
                $group: {
                    _id: "$status",
                    count: { $sum: 1 },
                },
            },
        ]);

        const stats = {
            invited: 0,
            registered: 0,
            active: 0,
            removed: 0,
        };
        memberStats.forEach((s: any) => {
            stats[s._id as keyof typeof stats] = s.count;
        });

        return reply.status(200).send({
            organization: {
                id: org._id,
                name: org.name,
                type: org.type,
                registrationNumber: org.registrationNumber,
                address: org.address,
                contactPerson: org.contactPerson,
                tier: org.tier,
                seatCount: org.seatCount,
                discountPercentage: org.discountPercentage,
                commissionRate: org.commissionRate,
                status: org.status,
                createdAt: org.createdAt,
            },
            memberStats: stats,
            totalMembers: stats.invited + stats.registered + stats.active,
            seatsRemaining: org.seatCount - (stats.invited + stats.registered + stats.active),
        });
    } catch (error) {
        console.error("Error getting organization:", error);
        reply.status(500).send({ message: "Failed to get organization", error });
    }
};

// Add single member to organization
export const addMember = async (
    req: FastifyRequest<{ Params: { id: string }; Body: AddMemberBody }>,
    reply: FastifyReply
) => {
    try {
        const { id } = req.params;
        const { email, name, employeeId, department } = req.body;
        const userId = (req as any).user.id;

        const org = await Organization.findById(id);
        if (!org) {
            return reply.status(404).send({ message: "Organization not found" });
        }

        // Check authorization
        if (org.adminUser?.toString() !== userId) {
            return reply.status(403).send({ message: "Only organization admin can add members" });
        }

        if (org.status !== "verified") {
            return reply.status(400).send({ message: "Organization must be verified to add members" });
        }

        // Check seat availability
        const currentMembers = await OrganizationMember.countDocuments({
            organization: id,
            status: { $ne: "removed" },
        });

        if (currentMembers >= org.seatCount) {
            return reply.status(400).send({ message: "No seats available. Upgrade your plan to add more members." });
        }

        // Check if member already exists
        const existingMember = await OrganizationMember.findOne({
            organization: id,
            email: email.toLowerCase(),
        });

        if (existingMember && existingMember.status !== "removed") {
            return reply.status(400).send({ message: "Member already exists in this organization" });
        }

        // Check if user exists
        const existingUser = await User.findOne({ email: email.toLowerCase() });

        // Generate invite token
        const inviteToken = (OrganizationMember as any).generateInviteToken();

        const member = existingMember || new OrganizationMember({
            organization: id,
            email: email.toLowerCase(),
            name,
            employeeId: employeeId || null,
            department: department || null,
        });

        member.status = existingUser ? "registered" : "invited";
        member.user = existingUser ? (existingUser._id as any) : null;
        member.inviteToken = existingUser ? null : inviteToken;
        member.inviteExpiresAt = existingUser ? null : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
        member.removedAt = null;
        member.removedReason = null;

        await member.save();

        // Update user's organization reference if they exist
        if (existingUser) {
            await User.findByIdAndUpdate(existingUser._id, { organization: org._id });
        } else {
            // Send invitation email with onboarding link
            const inviteLink = `${process.env.FRONTEND_URL}/org-onboard?token=${inviteToken}`;
            sendMemberInviteEmail(email, name, org.name, inviteLink).catch(err =>
                console.error("Failed to send member invite email:", err)
            );
        }

        // Create Audit Log
        await AuditLog.create({
            action: existingUser ? "MEMBER_ADDED" : "MEMBER_INVITED",
            performedBy: userId,
            targetEntity: "OrganizationMember",
            targetId: member._id,
            details: {
                memberEmail: member.email,
                memberName: member.name,
                userId: existingUser?._id
            },
            organization: id
        });

        return reply.status(201).send({
            message: existingUser ? "Member added successfully" : "Invitation sent successfully",
            member: {
                id: member._id,
                email: member.email,
                name: member.name,
                status: member.status,
            },
        });
    } catch (error) {
        console.error("Error adding member:", error);
        reply.status(500).send({ message: "Failed to add member", error });
    }
};

// Resend invitation email to a member
export const resendMemberInvite = async (
    req: FastifyRequest<{ Params: { id: string; memberId: string } }>,
    reply: FastifyReply
) => {
    try {
        const { id, memberId } = req.params;
        const userId = (req as any).user?.id;

        const org = await Organization.findById(id);
        if (!org) {
            return reply.status(404).send({ message: "Organization not found" });
        }

        if (org.adminUser?.toString() !== userId) {
            return reply.status(403).send({ message: "Only organization admin can resend invites" });
        }

        const member = await OrganizationMember.findOne({ _id: memberId, organization: id });
        if (!member) {
            return reply.status(404).send({ message: "Member not found" });
        }

        if (member.status !== "invited") {
            return reply.status(400).send({ message: "Can only resend invite to pending members" });
        }

        // Generate new invite token and extend expiry
        const inviteToken = (OrganizationMember as any).generateInviteToken();
        member.inviteToken = inviteToken;
        member.inviteExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
        await member.save();

        // Send invitation email
        const inviteLink = `${process.env.FRONTEND_URL}/org-onboard?token=${inviteToken}`;
        await sendMemberInviteEmail(member.email, member.name, org.name, inviteLink);

        // Create Audit Log
        await AuditLog.create({
            action: "INVITE_RESENT",
            performedBy: userId,
            targetEntity: "OrganizationMember",
            targetId: member._id,
            details: {
                memberEmail: member.email
            },
            organization: id
        });

        return reply.status(200).send({
            message: "Invitation resent successfully",
        });
    } catch (error) {
        console.error("Error resending invite:", error);
        reply.status(500).send({ message: "Failed to resend invite", error });
    }
};

// Bulk add members (CSV import)
export const bulkAddMembers = async (
    req: FastifyRequest<{ Params: { id: string }; Body: BulkAddMembersBody }>,
    reply: FastifyReply
) => {
    try {
        const { id } = req.params;
        const { members } = req.body;
        const userId = (req as any).user.id;

        const org = await Organization.findById(id);
        if (!org) {
            return reply.status(404).send({ message: "Organization not found" });
        }

        // Check authorization
        if (org.adminUser?.toString() !== userId) {
            return reply.status(403).send({ message: "Only organization admin can add members" });
        }

        if (org.status !== "verified") {
            return reply.status(400).send({ message: "Organization must be verified to add members" });
        }

        // Check seat availability
        const currentMembers = await OrganizationMember.countDocuments({
            organization: id,
            status: { $ne: "removed" },
        });

        const availableSeats = org.seatCount - currentMembers;
        if (members.length > availableSeats) {
            return reply.status(400).send({
                message: `Only ${availableSeats} seats available. Cannot add ${members.length} members.`
            });
        }

        const results = {
            added: [] as string[],
            invited: [] as string[],
            failed: [] as { email: string; reason: string }[],
        };

        for (const memberData of members) {
            try {
                const email = memberData.email.toLowerCase();

                // Check if already exists
                const existing = await OrganizationMember.findOne({
                    organization: id,
                    email,
                    status: { $ne: "removed" },
                });

                if (existing) {
                    results.failed.push({ email, reason: "Already exists" });
                    continue;
                }

                const existingUser = await User.findOne({ email });
                const inviteToken = existingUser ? null : (OrganizationMember as any).generateInviteToken();

                const member = new OrganizationMember({
                    organization: id,
                    email,
                    name: memberData.name,
                    employeeId: memberData.employeeId || null,
                    department: memberData.department || null,
                    status: existingUser ? "registered" : "invited",
                    user: existingUser?._id || null,
                    inviteToken,
                    inviteExpiresAt: existingUser ? null : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                });

                await member.save();

                if (existingUser) {
                    await User.findByIdAndUpdate(existingUser._id, { organization: org._id });
                    results.added.push(email);
                } else {
                    const inviteLink = `${process.env.FRONTEND_URL}/org-onboard?token=${inviteToken}`;
                    sendMemberInviteEmail(email, memberData.name, org.name, inviteLink).catch(err =>
                        console.error("Failed to send invite:", err)
                    );
                    results.invited.push(email);
                }
            } catch (err) {
                results.failed.push({ email: memberData.email, reason: "Processing error" });
            }
        }

        return reply.status(200).send({
            message: `Processed ${members.length} members`,
            results,
            summary: {
                added: results.added.length,
                invited: results.invited.length,
                failed: results.failed.length,
            },
        });
    } catch (error) {
        console.error("Error bulk adding members:", error);
        reply.status(500).send({ message: "Failed to bulk add members", error });
    }
};

// Get organization members
export const getMembers = async (
    req: FastifyRequest<{ Params: { id: string }; Querystring: { status?: string; page?: string; limit?: string } }>,
    reply: FastifyReply
) => {
    try {
        const { id } = req.params;
        const { status, page = "1", limit = "20" } = req.query;
        const userId = (req as any).user.id;

        const org = await Organization.findById(id);
        if (!org) {
            return reply.status(404).send({ message: "Organization not found" });
        }

        // Check authorization
        const user = await User.findById(userId);
        const isOrgAdmin = org.adminUser?.toString() === userId;
        const isSystemAdmin = user?.userType === "Admin";

        if (!isOrgAdmin && !isSystemAdmin) {
            return reply.status(403).send({ message: "Not authorized" });
        }

        const query: any = { organization: id };
        if (status && status !== 'all') {
            // If status is provided, filter by that specific status
            query.status = status;
        } else {
            // By default (or for 'all'), exclude removed members
            query.status = { $ne: "removed" };
        }

        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        const [members, total] = await Promise.all([
            OrganizationMember.find(query)
                .populate("user", "fullname email")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limitNum),
            OrganizationMember.countDocuments(query),
        ]);

        return reply.status(200).send({
            members: members.map(m => ({
                id: m._id,
                email: m.email,
                name: m.name,
                employeeId: m.employeeId,
                department: m.department,
                status: m.status,
                user: m.user,
                lastPurchaseAt: m.lastPurchaseAt,
                totalPurchases: m.totalPurchases,
                totalSpent: m.totalSpent,
                joinedAt: m.joinedAt,
                createdAt: m.createdAt,
            })),
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                pages: Math.ceil(total / limitNum),
            },
        });
    } catch (error) {
        console.error("Error getting members:", error);
        reply.status(500).send({ message: "Failed to get members", error });
    }
};

// Remove member from organization
export const removeMember = async (
    req: FastifyRequest<{ Params: { id: string; memberId: string }; Body: { reason?: string } }>,
    reply: FastifyReply
) => {
    try {
        const { id, memberId } = req.params;
        const reason = req.body?.reason || null;
        const userId = (req as any).user?.id;

        console.log("[removeMember] Params:", { id, memberId, userId, reason });

        if (!userId) {
            return reply.status(401).send({ message: "Not authenticated" });
        }

        const org = await Organization.findById(id);
        if (!org) {
            console.log("[removeMember] Organization not found:", id);
            return reply.status(404).send({ message: "Organization not found" });
        }

        console.log("[removeMember] Org adminUser:", org.adminUser?.toString(), "User ID:", userId);

        if (org.adminUser?.toString() !== userId) {
            return reply.status(403).send({ message: "Only organization admin can remove members" });
        }

        const member = await OrganizationMember.findOne({ _id: memberId, organization: id });
        if (!member) {
            console.log("[removeMember] Member not found:", memberId);
            return reply.status(404).send({ message: "Member not found" });
        }

        member.status = "removed";
        member.removedAt = new Date();
        member.removedReason = reason;
        await member.save();

        // Remove organization reference from user
        if (member.user) {
            await User.findByIdAndUpdate(member.user, {
                organization: null,
                studyGroup: null
            });
        }

        // Create Audit Log
        await AuditLog.create({
            action: "MEMBER_REMOVED",
            performedBy: userId,
            targetEntity: "OrganizationMember",
            targetId: member._id,
            details: {
                removedMemberEmail: member.email,
                reason: reason,
                userId: member.user
            },
            organization: id
        });

        console.log("[removeMember] Member removed successfully:", memberId);
        return reply.status(200).send({ message: "Member removed successfully" });
    } catch (error: any) {
        console.error("[removeMember] Error:", error?.message || error, error?.stack);
        reply.status(500).send({ message: "Failed to remove member", error: error?.message || "Unknown error" });
    }
};

// Admin: Get all organizations (with optional status filter)
export const getPendingOrganizations = async (
    req: FastifyRequest<{ Querystring: { status?: string; all?: string } }>,
    reply: FastifyReply
) => {
    try {
        const { status, all } = req.query as { status?: string; all?: string };

        // Build query filter
        let filter: any = {};

        // If 'all' is not explicitly true, only show pending by default
        if (all !== 'true' && !status) {
            filter.status = 'pending';
        } else if (status) {
            filter.status = status;
        }

        const orgs = await Organization.find(filter)
            .populate('adminUser', 'fullname email isVerified')
            .sort({ createdAt: -1 });

        return reply.status(200).send({
            organizations: orgs.map(o => ({
                id: o._id,
                name: o.name,
                type: o.type,
                registrationNumber: o.registrationNumber,
                contactPerson: o.contactPerson,
                address: o.address,
                seatCount: o.seatCount,
                tier: o.tier,
                discountPercentage: o.discountPercentage,
                commissionRate: o.commissionRate,
                status: o.status,
                isEmailVerified: o.isEmailVerified,
                adminUser: o.adminUser,
                verifiedAt: o.verifiedAt,
                rejectionReason: o.rejectionReason,
                createdAt: o.createdAt,
            })),
        });
    } catch (error) {
        console.error("Error getting organizations:", error);
        reply.status(500).send({ message: "Failed to get organizations", error });
    }
};

// Admin: Verify or reject organization
export const verifyOrganization = async (
    req: FastifyRequest<{
        Params: { id: string };
        Body: { action: "verify" | "reject"; reason?: string; commissionRate?: number }
    }>,
    reply: FastifyReply
) => {
    try {
        const { id } = req.params;
        const { action, reason, commissionRate } = req.body;
        const adminId = (req as any).user.id;

        const org = await Organization.findById(id);
        if (!org) {
            return reply.status(404).send({ message: "Organization not found" });
        }

        if (org.status !== "pending") {
            return reply.status(400).send({ message: "Organization is not pending verification" });
        }

        if (action === "verify") {
            org.status = "verified";
            org.verifiedBy = adminId;
            org.verifiedAt = new Date();
            if (commissionRate) {
                org.commissionRate = commissionRate;
            }

            // Create admin user for the organization contact
            let adminUser = await User.findOne({ email: org.contactPerson.email });
            if (!adminUser) {
                // Note: In production, you'd send a registration link instead
                console.log(`Organization ${org.name} verified. Contact should register at ${org.contactPerson.email}`);
            } else {
                org.adminUser = adminUser._id as any;
                await User.findByIdAndUpdate(adminUser._id, { organization: org._id });
            }

            // Send verification email
            sendOrgVerificationEmail(org.contactPerson.email, org.name, true).catch(err =>
                console.error("Failed to send verification email:", err)
            );
        } else {
            org.status = "rejected";
            org.rejectionReason = reason || "Does not meet requirements";

            sendOrgVerificationEmail(org.contactPerson.email, org.name, false, reason).catch(err =>
                console.error("Failed to send rejection email:", err)
            );
        }

        await org.save();

        return reply.status(200).send({
            message: `Organization ${action === "verify" ? "verified" : "rejected"} successfully`,
            organization: {
                id: org._id,
                name: org.name,
                status: org.status,
            },
        });
    } catch (error) {
        console.error("Error verifying organization:", error);
        reply.status(500).send({ message: "Failed to verify organization", error });
    }
};

// Admin: Update organization settings (tier, discount, commission, etc.)
export const updateOrganizationSettings = async (
    req: FastifyRequest<{
        Params: { id: string };
        Body: {
            name?: string;
            tier?: number;
            discountPercentage?: number;
            commissionRate?: number;
            seatCount?: number;
            status?: "verified" | "suspended";
        };
    }>,
    reply: FastifyReply
) => {
    try {
        const { id } = req.params;
        const { name, tier, discountPercentage, commissionRate, seatCount, status } = req.body;

        const org = await Organization.findById(id);
        if (!org) {
            return reply.status(404).send({ message: "Organization not found" });
        }

        // Update fields if provided
        if (name !== undefined) org.name = name;
        if (tier !== undefined) org.tier = tier;
        if (discountPercentage !== undefined) org.discountPercentage = discountPercentage;
        if (commissionRate !== undefined) org.commissionRate = commissionRate;
        if (seatCount !== undefined) org.seatCount = seatCount;
        if (status !== undefined) org.status = status;

        await org.save();

        return reply.status(200).send({
            message: "Organization settings updated successfully",
            organization: {
                id: org._id,
                name: org.name,
                tier: org.tier,
                discountPercentage: org.discountPercentage,
                commissionRate: org.commissionRate,
                seatCount: org.seatCount,
                status: org.status,
            },
        });
    } catch (error) {
        console.error("Error updating organization settings:", error);
        reply.status(500).send({ message: "Failed to update organization settings", error });
    }
};

// ================================
// ORG ADMIN PORTAL ENDPOINTS
// ================================

// Get current user's organization (for org admin portal)
export const getMyOrganization = async (
    req: FastifyRequest,
    reply: FastifyReply
) => {
    try {
        const userId = (req as any).user.id;

        // Find organization where user is admin
        const org = await Organization.findOne({ adminUser: userId });

        if (!org) {
            return reply.status(404).send({
                message: "No organization found for this user",
                isOrgAdmin: false
            });
        }

        // Get member stats
        const memberStats = await OrganizationMember.aggregate([
            { $match: { organization: org._id } },
            {
                $group: {
                    _id: "$status",
                    count: { $sum: 1 },
                    totalSpent: { $sum: "$totalSpent" },
                    totalPurchases: { $sum: "$totalPurchases" },
                },
            },
        ]);

        const stats = {
            invited: 0,
            registered: 0,
            active: 0,
            removed: 0,
            totalSpent: 0,
            totalPurchases: 0,
        };
        memberStats.forEach((s: any) => {
            const statusKey = s._id as keyof typeof stats;
            if (stats[statusKey] !== undefined) {
                stats[statusKey] = s.count;
            }
            if (statusKey !== "removed") {
                stats.totalSpent += s.totalSpent || 0;
                stats.totalPurchases += s.totalPurchases || 0;
            }
        });

        // Get real-time commission data from Commission collection
        // This provides accurate pending/paid breakdown instead of cached aggregates
        const Commission = (await import("../models/Commission")).default;
        const allCommissions = await Commission.find({ organization: org._id });
        
        const commissionBreakdown = {
            totalCommissionEarned: allCommissions.reduce((sum, c) => sum + c.finalAmount, 0),
            pendingCommission: allCommissions
                .filter(c => c.status === 'pending' || c.status === 'processed')
                .reduce((sum, c) => sum + c.finalAmount, 0),
            paidCommission: allCommissions
                .filter(c => c.status === 'paid')
                .reduce((sum, c) => sum + c.finalAmount, 0),
            totalRecords: allCommissions.length,
            pendingRecords: allCommissions.filter(c => c.status === 'pending' || c.status === 'processed').length,
            paidRecords: allCommissions.filter(c => c.status === 'paid').length,
        };

        // Get real purchase data from Purchase collection instead of cached OrganizationMember stats
        // This ensures accurate counts even after database cleanup
        const members = await OrganizationMember.find({
            organization: org._id,
            user: { $ne: null },
            status: { $ne: "removed" }
        }).select("user");
        
        const memberUserIds = members.map(m => m.user);
        
        const Purchase = (await import("../models/Purchase")).default;
        const purchases = await Purchase.find({
            user: { $in: memberUserIds },
            status: "captured"
        }).select("amount");
        
        const realPurchaseStats = {
            totalPurchases: purchases.length,
            totalSpent: purchases.reduce((sum, p) => sum + (p.amount || 0), 0)
        };

        // Override cached stats with real data from Purchase collection
        stats.totalPurchases = realPurchaseStats.totalPurchases;
        stats.totalSpent = realPurchaseStats.totalSpent;

        return reply.status(200).send({
            isOrgAdmin: true,
            organization: {
                id: org._id,
                name: org.name,
                type: org.type,
                registrationNumber: org.registrationNumber,
                address: org.address,
                contactPerson: org.contactPerson,
                tier: org.tier,
                seatCount: org.seatCount,
                discountPercentage: org.discountPercentage,
                commissionRate: org.commissionRate,
                status: org.status,
                isEmailVerified: org.isEmailVerified,
                verifiedAt: org.verifiedAt,
                createdAt: org.createdAt,
            },
            memberStats: stats,
            commissionBreakdown, // Real-time commission data from Commission collection
            totalMembers: stats.invited + stats.registered + stats.active,
            seatsRemaining: org.seatCount - (stats.invited + stats.registered + stats.active),
        });
    } catch (error) {
        console.error("Error getting my organization:", error);
        reply.status(500).send({ message: "Failed to get organization", error });
    }
};

// Get purchases made by organization members
export const getMemberPurchases = async (
    req: FastifyRequest<{
        Params: { id: string };
        Querystring: { page?: string; limit?: string; startDate?: string; endDate?: string }
    }>,
    reply: FastifyReply
) => {
    try {
        const { id } = req.params;
        const { page = "1", limit = "20", startDate, endDate } = req.query;
        const userId = (req as any).user.id;

        const org = await Organization.findById(id);
        if (!org) {
            return reply.status(404).send({ message: "Organization not found" });
        }

        // Check authorization (must be org admin or system admin)
        const user = await User.findById(userId);
        const isOrgAdmin = org.adminUser?.toString() === userId;
        const isSystemAdmin = user?.userType === "Admin";

        if (!isOrgAdmin && !isSystemAdmin) {
            return reply.status(403).send({ message: "Not authorized to view this data" });
        }

        // Get all member user IDs
        const members = await OrganizationMember.find({
            organization: id,
            user: { $ne: null }
        }).select("user name email");

        const memberUserIds = members.map(m => m.user);
        const memberMap = new Map(members.map(m => [m.user?.toString(), { name: m.name, email: m.email }]));

        // Import Purchase model dynamically to avoid circular dependency
        const Purchase = (await import("../models/Purchase")).default;

        // Build date filter
        const dateFilter: any = {};
        if (startDate) {
            dateFilter.$gte = new Date(startDate);
        }
        if (endDate) {
            dateFilter.$lte = new Date(endDate);
        }

        const query: any = {
            user: { $in: memberUserIds },
            status: "captured"
        };
        if (startDate || endDate) {
            query.createdAt = dateFilter;
        }

        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        const [purchases, total, aggregateStats] = await Promise.all([
            Purchase.find(query)
                .populate("package", "name description packageType")
                .populate("user", "fullname email")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limitNum),
            Purchase.countDocuments(query),
            Purchase.aggregate([
                { $match: query },
                {
                    $group: {
                        _id: null,
                        totalRevenue: { $sum: "$amount" },
                        totalPurchases: { $sum: 1 },
                    },
                },
            ]),
        ]);

        const stats = aggregateStats[0] || { totalRevenue: 0, totalPurchases: 0 };
        const estimatedCommission = (stats.totalRevenue * org.commissionRate) / 100;

        return reply.status(200).send({
            purchases: purchases.map((p: any) => ({
                id: p._id,
                studentName: p.user?.fullname || memberMap.get(p.user?.toString())?.name || "Unknown",
                studentEmail: p.user?.email || memberMap.get(p.user?.toString())?.email || "Unknown",
                packageName: p.orderDetails?.packageName || p.package?.name || "Unknown",
                amount: p.amount,
                status: p.status,
                paymentId: p.razorpayPaymentId,
                purchaseDate: p.createdAt,
            })),
            summary: {
                totalRevenue: stats.totalRevenue,
                totalPurchases: stats.totalPurchases,
                commissionRate: org.commissionRate,
                estimatedCommission,
            },
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                pages: Math.ceil(total / limitNum),
            },
        });
    } catch (error) {
        console.error("Error getting member purchases:", error);
        reply.status(500).send({ message: "Failed to get purchases", error });
    }
};

// Get financial report for organization
export const getFinancialReport = async (
    req: FastifyRequest<{
        Params: { id: string };
        Querystring: { period?: string; startDate?: string; endDate?: string }
    }>,
    reply: FastifyReply
) => {
    try {
        const { id } = req.params;
        const { period = "monthly", startDate, endDate } = req.query;
        const userId = (req as any).user.id;

        const org = await Organization.findById(id);
        if (!org) {
            return reply.status(404).send({ message: "Organization not found" });
        }

        // Check authorization
        const user = await User.findById(userId);
        const isOrgAdmin = org.adminUser?.toString() === userId;
        const isSystemAdmin = user?.userType === "Admin";

        if (!isOrgAdmin && !isSystemAdmin) {
            return reply.status(403).send({ message: "Not authorized to view this data" });
        }

        // Get member user IDs
        const members = await OrganizationMember.find({
            organization: id,
            user: { $ne: null },
            status: { $ne: "removed" }
        }).select("user");

        const memberUserIds = members.map(m => m.user);

        const Purchase = (await import("../models/Purchase")).default;
        const Commission = (await import("../models/Commission")).default;

        // Calculate date range
        let queryStartDate: Date;
        let queryEndDate = new Date();

        if (startDate && endDate) {
            queryStartDate = new Date(startDate);
            queryEndDate = new Date(endDate);
        } else {
            // Default to last 12 months
            queryStartDate = new Date();
            queryStartDate.setMonth(queryStartDate.getMonth() - 12);
        }

        // Get monthly breakdown of purchases
        const monthlyData = await Purchase.aggregate([
            {
                $match: {
                    user: { $in: memberUserIds },
                    status: "captured",
                    createdAt: { $gte: queryStartDate, $lte: queryEndDate }
                }
            },
            {
                $group: {
                    _id: {
                        year: { $year: "$createdAt" },
                        month: { $month: "$createdAt" }
                    },
                    totalSales: { $sum: "$amount" },
                    purchaseCount: { $sum: 1 },
                }
            },
            { $sort: { "_id.year": 1, "_id.month": 1 } }
        ]);

        // Calculate commission for each month
        const monthlyReport = monthlyData.map((m: any) => ({
            period: `${m._id.year}-${String(m._id.month).padStart(2, '0')}`,
            year: m._id.year,
            month: m._id.month,
            totalSales: m.totalSales,
            purchaseCount: m.purchaseCount,
            commissionRate: org.commissionRate,
            commissionEarned: (m.totalSales * org.commissionRate) / 100,
        }));

        // Get existing commission records - include all statuses
        // FIXED: Query all commissions for org, then filter by date range in-memory
        // This ensures new commissions after payouts are always visible
        const allCommissions = await Commission.find({
            organization: id
        }).sort({ "period.startDate": -1 });

        // Filter commissions by date range in-memory
        const commissions = allCommissions.filter(c => {
            const periodStart = new Date(c.period.startDate);
            return periodStart >= queryStartDate && periodStart <= queryEndDate;
        });

        // Calculate totals using ALL commissions (not just date-filtered)
        // This prevents "pending commission = 0" bug after first payout
        const totals = {
            totalSales: monthlyReport.reduce((sum, m) => sum + m.totalSales, 0),
            totalPurchases: monthlyReport.reduce((sum, m) => sum + m.purchaseCount, 0),
            totalCommissionEarned: monthlyReport.reduce((sum, m) => sum + m.commissionEarned, 0),
            pendingCommission: allCommissions
                .filter(c => c.status === "pending" || c.status === "processed")
                .reduce((sum, c) => sum + c.finalAmount, 0),
            paidCommission: allCommissions
                .filter(c => c.status === "paid")
                .reduce((sum, c) => sum + c.finalAmount, 0),
        };

        // Get top performing students
        const topStudents = await OrganizationMember.find({
            organization: id,
            status: { $ne: "removed" },
            totalSpent: { $gt: 0 }
        })
            .sort({ totalSpent: -1 })
            .limit(10)
            .select("name email totalSpent totalPurchases lastPurchaseAt");

        return reply.status(200).send({
            organization: {
                id: org._id,
                name: org.name,
                tier: org.tier,
                commissionRate: org.commissionRate,
                discountPercentage: org.discountPercentage,
            },
            dateRange: {
                startDate: queryStartDate,
                endDate: queryEndDate,
            },
            monthlyReport,
            totals,
            commissionRecords: commissions.map(c => ({
                id: c._id,
                period: c.period,
                totalSales: c.totalSales,
                purchaseCount: c.purchaseCount,
                commissionRate: c.commissionRate,
                totalCommission: c.totalCommission,
                finalAmount: c.finalAmount,
                status: c.status,
                paidAt: c.paymentDetails?.paidAt,
            })),
            topStudents: topStudents.map(s => ({
                name: s.name,
                email: s.email,
                totalSpent: s.totalSpent,
                totalPurchases: s.totalPurchases,
                lastPurchaseAt: s.lastPurchaseAt,
            })),
        });
    } catch (error) {
        console.error("Error getting financial report:", error);
        reply.status(500).send({ message: "Failed to get financial report", error });
    }
};

// Helper: Calculate tier based on seat count
async function calculateOrganizationTier(seatCount: number): Promise<number> {
    const rules = await DiscountRule.find({
        type: "organization",
        isActive: true,
    }).sort({ tier: 1 });

    for (const rule of rules) {
        if (seatCount >= rule.minThreshold &&
            (rule.maxThreshold === null || seatCount <= rule.maxThreshold)) {
            return rule.tier;
        }
    }
    return 1; // Default tier
}

// Helper: Send organization registration email
async function sendOrgRegistrationEmail(email: string, orgName: string): Promise<void> {
    const subject = `Registration Received - ${orgName} - Prayash Assets`;
    const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #3B82F6;">Registration Received</h2>
      <p>Thank you for registering <strong>${orgName}</strong> with Prayash Assets.</p>
      <p>Your registration is currently <strong>under review</strong>. Our team will verify your documents and contact you within 2-3 business days.</p>
      <p>Once verified, you'll be able to:</p>
      <ul>
        <li>Add students to your organization</li>
        <li>Enable exclusive discounts for your students</li>
        <li>Track purchases and earn commissions</li>
      </ul>
      <p>Best regards,<br>The Prayash Assets Team</p>
    </div>
  `;

    await emailService.sendEmail({ to: email, subject, html, text: `Registration received for ${orgName}. Under review.` });
}

// Helper: Send member invite email
async function sendMemberInviteEmail(email: string, name: string, orgName: string, inviteLink: string): Promise<void> {
    const subject = `You're invited to join ${orgName} on Prayash Assets`;
    const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
      <div style="background-color: white; border-radius: 12px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <h2 style="color: #3B82F6; margin-top: 0;">Welcome to ${orgName}!</h2>
        <p style="color: #374151; font-size: 16px;">Hello ${name},</p>
        <p style="color: #374151; font-size: 16px;">You've been invited to join <strong>${orgName}</strong> on Prayash Assets.</p>
        <p style="color: #374151; font-size: 16px;">As a member, you'll get exclusive discounts on mock test packages!</p>
        
        <div style="text-align: center; margin: 32px 0;">
          <table border="0" cellpadding="0" cellspacing="0" style="margin: 0 auto;">
            <tr>
              <td style="background-color: #22C55E; border-radius: 8px;">
                <a href="${inviteLink}" target="_blank" style="display: inline-block; padding: 14px 32px; font-size: 16px; font-weight: bold; color: #ffffff; text-decoration: none;">
                  Accept Invitation
                </a>
              </td>
            </tr>
          </table>
        </div>
        
        <p style="color: #6B7280; font-size: 14px;">Or copy and paste this link in your browser:</p>
        <p style="color: #3B82F6; font-size: 14px; word-break: break-all;"><a href="${inviteLink}" style="color: #3B82F6;">${inviteLink}</a></p>
        
        <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 24px 0;" />
        
        <p style="color: #EF4444; font-size: 14px;"><strong>⏰ This invitation expires in 30 days.</strong></p>
        <p style="color: #6B7280; font-size: 14px; margin-bottom: 0;">Best regards,<br/>The Prayash Assets Team</p>
      </div>
    </div>
  `;

    await emailService.sendEmail({ to: email, subject, html, text: `Hello ${name}, you've been invited to join ${orgName} on Prayash Assets. Accept your invitation here: ${inviteLink} (expires in 30 days)` });
}

// Helper: Send verification/rejection email
async function sendOrgVerificationEmail(email: string, orgName: string, approved: boolean, reason?: string): Promise<void> {
    const subject = approved
        ? `Congratulations! ${orgName} is now verified - Prayash Assets`
        : `Registration Update - ${orgName} - Prayash Assets`;

    const html = approved
        ? `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #22C55E;">🎉 Organization Verified!</h2>
        <p>Great news! <strong>${orgName}</strong> has been verified on Prayash Assets.</p>
        <p>You can now:</p>
        <ul>
          <li>Log in to your organization dashboard</li>
          <li>Add students to unlock exclusive discounts</li>
          <li>Track purchases and commissions</li>
        </ul>
        <p>Best regards,<br>The Prayash Assets Team</p>
      </div>
    `
        : `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #EF4444;">Registration Update</h2>
        <p>We've reviewed your registration for <strong>${orgName}</strong>.</p>
        <p>Unfortunately, we were unable to verify your organization at this time.</p>
        ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
        <p>If you believe this is an error, please contact our support team.</p>
        <p>Best regards,<br>The Prayash Assets Team</p>
      </div>
    `;

    await emailService.sendEmail({ to: email, subject, html, text: approved ? `${orgName} verified!` : `Registration update for ${orgName}` });
}

// Helper: Send OTP verification email
async function sendOrgVerificationOTPEmail(email: string, orgName: string, verificationCode: string): Promise<void> {
    const subject = `Verify your email - ${orgName} Registration - Prayash Assets`;
    const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #3B82F6;">Email Verification Required</h2>
      <p>Thank you for registering <strong>${orgName}</strong> with Prayash Assets.</p>
      <p>Please use the following verification code to verify your email address:</p>
      <div style="text-align: center; margin: 30px 0;">
        <div style="background-color: #F3F4F6; border-radius: 8px; padding: 20px; display: inline-block;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1F2937;">${verificationCode}</span>
        </div>
      </div>
      <p style="color: #EF4444;"><strong>This code expires in 10 minutes.</strong></p>
      <p>If you didn't register an organization, please ignore this email.</p>
      <p>Best regards,<br>The Prayash Assets Team</p>
    </div>
  `;

    await emailService.sendEmail({
        to: email,
        subject,
        html,
        text: `Your verification code for ${orgName}: ${verificationCode}. This code expires in 10 minutes.`
    });
}

// ================================
// ORG MEMBER INVITE ONBOARDING
// ================================

// Validate invite token (check if it's valid and not expired)
export const validateInviteToken = async (
    req: FastifyRequest<{ Params: { token: string } }>,
    reply: FastifyReply
) => {
    try {
        const { token } = req.params;
        console.log(`[validateInviteToken] Validating token: ${token}`);

        // Debug: Find member by token only, to check status/expiry if found
        const debugMember = await OrganizationMember.findOne({ inviteToken: token });
        if (debugMember) {
            console.log(`[validateInviteToken] Found member: ${debugMember._id}, Status: ${debugMember.status}, Expires: ${debugMember.inviteExpiresAt}`);
            console.log(`[validateInviteToken] Expiry check: ${new Date() < debugMember.inviteExpiresAt! ? 'Valid' : 'Expired'}`);
        } else {
            console.log(`[validateInviteToken] No member found with token: ${token}`);
        }

        const member = await OrganizationMember.findOne({
            inviteToken: token,
            inviteExpiresAt: { $gt: new Date() },
            status: "invited",
        }).populate("organization", "name type discountPercentage");

        if (!member) {
            console.log("[validateInviteToken] Validation failed - member not found with all criteria");
            return reply.status(404).send({
                message: "Invalid or expired invitation link",
                valid: false,
            });
        }

        return reply.status(200).send({
            valid: true,
            member: {
                email: member.email,
                name: member.name,
            },
            organization: member.organization,
        });
    } catch (error) {
        console.error("Error validating invite token:", error);
        reply.status(500).send({ message: "Failed to validate invite", error });
    }
};

// Start onboarding - Send OTP to member's email
export const startOrgMemberOnboarding = async (
    req: FastifyRequest<{ Params: { token: string }; Body: { phone: number } }>,
    reply: FastifyReply
) => {
    try {
        const { token } = req.params;
        const { phone } = req.body;

        const member = await OrganizationMember.findOne({
            inviteToken: token,
            inviteExpiresAt: { $gt: new Date() },
            status: "invited",
        }).populate("organization", "name");

        if (!member) {
            return reply.status(404).send({
                message: "Invalid or expired invitation link",
            });
        }

        // Check if user already exists with this email
        const existingUser = await User.findOne({ email: member.email.toLowerCase() });
        if (existingUser) {
            // Link existing user to org
            await User.findByIdAndUpdate(existingUser._id, { organization: member.organization });
            member.user = existingUser._id as any;
            member.status = "registered";
            member.inviteToken = null;
            member.inviteExpiresAt = null;
            await member.save();

            return reply.status(200).send({
                message: "Your account already exists. You've been linked to the organization. Please login.",
                existingUser: true,
            });
        }

        // Generate OTP
        const verificationCode = generateVerificationCode();
        const verificationExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        // Store the OTP and phone in the member record temporarily
        (member as any).verificationCode = verificationCode;
        (member as any).verificationExpiry = verificationExpiry;
        (member as any).pendingPhone = phone;
        await member.save();

        // Send OTP email
        const orgName = (member.organization as any)?.name || "Organization";
        await sendMemberOnboardingOTPEmail(member.email, member.name, orgName, verificationCode);

        return reply.status(200).send({
            message: "Verification code sent to your email",
            email: member.email,
        });
    } catch (error) {
        console.error("Error starting org member onboarding:", error);
        reply.status(500).send({ message: "Failed to start onboarding", error });
    }
};

// Complete onboarding - Verify OTP and set password
export const completeOrgMemberOnboarding = async (
    req: FastifyRequest<{
        Params: { token: string };
        Body: { code: string; password: string; phone: number };
    }>,
    reply: FastifyReply
) => {
    try {
        const { token } = req.params;
        const { code, password, phone } = req.body;

        const member = await OrganizationMember.findOne({
            inviteToken: token,
            inviteExpiresAt: { $gt: new Date() },
            status: "invited",
        }).populate("organization", "_id name");

        if (!member) {
            return reply.status(404).send({
                message: "Invalid or expired invitation link",
            });
        }

        // Verify OTP
        const storedCode = (member as any).verificationCode;
        const codeExpiry = (member as any).verificationExpiry;

        if (!storedCode || !codeExpiry || new Date() > codeExpiry) {
            return reply.status(400).send({
                message: "Verification code expired. Please request a new one.",
            });
        }

        if (storedCode !== code) {
            return reply.status(400).send({
                message: "Invalid verification code",
            });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Fetch default role for student
        const studentRole = await Role.findOne({ name: "student" });

        // Create new Student user
        const newUser = new Student({
            fullname: member.name,
            email: member.email.toLowerCase(),
            password: hashedPassword,
            phone: phone || (member as any).pendingPhone,
            isVerified: true, // Email verified via OTP
            organization: (member.organization as any)._id,
            roles: studentRole ? [studentRole._id] : [],
        });

        await newUser.save();

        // Update member record
        member.user = newUser._id as any;
        member.status = "registered";
        member.joinedAt = new Date();
        member.inviteToken = null;
        member.inviteExpiresAt = null;
        (member as any).verificationCode = null;
        (member as any).verificationExpiry = null;
        (member as any).pendingPhone = null;
        await member.save();

        return reply.status(201).send({
            message: "Account created successfully! You can now login.",
            user: {
                id: newUser._id,
                email: newUser.email,
                fullname: newUser.fullname,
            },
        });
    } catch (error: any) {
        console.error("Error completing org member onboarding:", error);
        if (error.code === 11000) {
            return reply.status(400).send({
                message: "An account with this email already exists. Please login instead.",
            });
        }
        reply.status(500).send({ message: "Failed to complete onboarding", error });
    }
};

// Resend OTP for org member onboarding
export const resendOrgMemberOTP = async (
    req: FastifyRequest<{ Params: { token: string } }>,
    reply: FastifyReply
) => {
    try {
        const { token } = req.params;

        const member = await OrganizationMember.findOne({
            inviteToken: token,
            inviteExpiresAt: { $gt: new Date() },
            status: "invited",
        }).populate("organization", "name");

        if (!member) {
            return reply.status(404).send({
                message: "Invalid or expired invitation link",
            });
        }

        // Generate new OTP
        const verificationCode = generateVerificationCode();
        const verificationExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        (member as any).verificationCode = verificationCode;
        (member as any).verificationExpiry = verificationExpiry;
        await member.save();

        // Send OTP email
        const orgName = (member.organization as any)?.name || "Organization";
        await sendMemberOnboardingOTPEmail(member.email, member.name, orgName, verificationCode);

        return reply.status(200).send({
            message: "New verification code sent to your email",
        });
    } catch (error) {
        console.error("Error resending org member OTP:", error);
        reply.status(500).send({ message: "Failed to resend OTP", error });
    }
};

// Helper: Send member onboarding OTP email
async function sendMemberOnboardingOTPEmail(
    email: string,
    name: string,
    orgName: string,
    verificationCode: string
): Promise<void> {
    const subject = `Complete Your Registration - ${orgName} on Prayash Assets`;
    const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #3B82F6;">Complete Your Registration</h2>
      <p>Hello ${name},</p>
      <p>You're almost there! Use the following verification code to complete your registration for <strong>${orgName}</strong>:</p>
      <div style="text-align: center; margin: 30px 0;">
        <div style="background-color: #F3F4F6; border-radius: 8px; padding: 20px; display: inline-block;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1F2937;">${verificationCode}</span>
        </div>
      </div>
      <p style="color: #EF4444;"><strong>This code expires in 10 minutes.</strong></p>
      <p>Once verified, you'll have access to exclusive discounts on mock test packages!</p>
      <p>Best regards,<br>The Prayash Assets Team</p>
    </div>
  `;

    await emailService.sendEmail({
        to: email,
        subject,
        html,
        text: `Your verification code for ${orgName}: ${verificationCode}. This code expires in 10 minutes.`,
    });
}

// Get all organizations (simple list for dropdowns)
export const getAllOrganizations = async (
    req: FastifyRequest,
    reply: FastifyReply
) => {
    try {
        const organizations = await Organization.find({ status: "verified" })
            .select("name _id")
            .sort({ name: 1 });
        reply.send(organizations);
    } catch (error) {
        console.error("Error getting all organizations:", error);
        reply.status(500).send({ message: "Failed to get organizations", error });
    }
};

// Get organization commission summary (real-time pending/paid amounts)
export const getOrganizationCommissionSummary = async (
    req: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
) => {
    try {
        const { id } = req.params;

        // Validate organization exists
        const org = await Organization.findById(id);
        if (!org) {
            return reply.status(404).send({ message: "Organization not found" });
        }

        const Commission = (await import("../models/Commission")).default;

        // Aggregate commissions by status for accurate real-time totals
        const summary = await Commission.aggregate([
            { $match: { organization: new Types.ObjectId(id) } },
            {
                $group: {
                    _id: "$status",
                    totalAmount: { $sum: "$finalAmount" },
                    count: { $sum: 1 }
                }
            }
        ]);

        // Extract pending and paid amounts
        const pendingCommission = summary
            .filter(s => s._id === "pending" || s._id === "processed")
            .reduce((sum, s) => sum + s.totalAmount, 0);
        
        const paidCommission = summary
            .filter(s => s._id === "paid")
            .reduce((sum, s) => sum + s.totalAmount, 0);

        reply.send({
            pendingCommission,
            paidCommission,
            totalCommission: pendingCommission + paidCommission
        });
    } catch (error) {
        console.error("Error getting organization commission summary:", error);
        reply.status(500).send({ message: "Failed to get commission summary", error });
    }
};
