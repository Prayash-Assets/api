import { FastifyRequest, FastifyReply } from "fastify";
import StudyGroup from "../models/StudyGroup";
import GroupInvitation from "../models/GroupInvitation";
import DiscountRule from "../models/DiscountRule";
import User from "../models/User";
import emailService from "../utils/emailService";

/**
 * Group Controller
 * Handles study group creation, joining, invitations, and management
 */

interface CreateGroupBody {
    name: string;
}

interface JoinGroupBody {
    code: string;
}

interface InviteMembersBody {
    emails: string[];
}

// Create a new study group
export const createGroup = async (
    req: FastifyRequest<{ Body: CreateGroupBody }>,
    reply: FastifyReply
) => {
    try {
        const userId = (req as any).user.id;
        const { name } = req.body;

        // Check if user already leads a group
        const existingLeadership = await StudyGroup.findOne({
            leader: userId,
            status: "active",
        });

        if (existingLeadership) {
            return reply.status(400).send({
                message: "You already lead an active group",
                existingGroup: {
                    id: existingLeadership._id,
                    name: existingLeadership.name,
                    code: existingLeadership.code,
                },
            });
        }

        // Generate unique code
        let code: string;
        let attempts = 0;
        do {
            code = (StudyGroup as any).generateCode();
            const exists = await StudyGroup.findOne({ code });
            if (!exists) break;
            attempts++;
        } while (attempts < 10);

        if (attempts >= 10) {
            return reply.status(500).send({ message: "Failed to generate unique group code" });
        }

        // Create group with leader as first member
        const group = new StudyGroup({
            name,
            code,
            leader: userId,
            members: [userId],
            memberCount: 1,
            isEligible: false,
            discountPercentage: 0,
        });

        await group.save();

        // Update user's studyGroup reference
        await User.findByIdAndUpdate(userId, { studyGroup: group._id });

        return reply.status(201).send({
            message: "Group created successfully",
            group: {
                id: group._id,
                name: group.name,
                code: group.code,
                memberCount: group.memberCount,
                isEligible: group.isEligible,
                joinLink: `${process.env.FRONTEND_URL}/student/groups/join?code=${group.code}`,
            },
        });
    } catch (error) {
        console.error("Error creating group:", error);
        reply.status(500).send({ message: "Failed to create group", error });
    }
};

// Get user's groups
export const getMyGroups = async (
    req: FastifyRequest,
    reply: FastifyReply
) => {
    try {
        const userId = (req as any).user.id;

        // Groups where user is a member
        const memberGroups = await StudyGroup.find({
            members: userId,
            status: "active",
        })
            .populate("leader", "fullname email")
            .sort({ createdAt: -1 });

        return reply.status(200).send({
            groups: memberGroups.map(g => ({
                id: g._id,
                name: g.name,
                code: g.code,
                memberCount: g.memberCount,
                isEligible: g.isEligible,
                discountPercentage: g.discountPercentage,
                discountExpiresAt: g.discountExpiresAt,
                isLeader: g.leader._id.toString() === userId,
                leader: g.leader,
                createdAt: g.createdAt,
            })),
        });
    } catch (error) {
        console.error("Error getting groups:", error);
        reply.status(500).send({ message: "Failed to get groups", error });
    }
};

// Get group by ID
export const getGroupById = async (
    req: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
) => {
    try {
        const { id } = req.params;
        const userId = (req as any).user.id;

        const group = await StudyGroup.findById(id)
            .populate("leader", "fullname email")
            .populate("members", "fullname email");

        if (!group) {
            return reply.status(404).send({ message: "Group not found" });
        }

        // Check if user is a member
        const isMember = group.members.some((m: any) => m._id.toString() === userId);
        if (!isMember) {
            return reply.status(403).send({ message: "You are not a member of this group" });
        }

        return reply.status(200).send({
            group: {
                id: group._id,
                name: group.name,
                code: group.code,
                memberCount: group.memberCount,
                isEligible: group.isEligible,
                discountPercentage: group.discountPercentage,
                discountExpiresAt: group.discountExpiresAt,
                isLeader: group.leader._id.toString() === userId,
                leader: group.leader,
                members: group.members,
                status: group.status,
                createdAt: group.createdAt,
            },
        });
    } catch (error) {
        console.error("Error getting group:", error);
        reply.status(500).send({ message: "Failed to get group", error });
    }
};

// Get group by code (for join preview)
export const getGroupByCode = async (
    req: FastifyRequest<{ Params: { code: string } }>,
    reply: FastifyReply
) => {
    try {
        const { code } = req.params;

        const group = await StudyGroup.findOne({ code: code.toUpperCase(), status: "active" })
            .populate("leader", "fullname");

        if (!group) {
            return reply.status(404).send({ message: "Group not found or inactive" });
        }

        return reply.status(200).send({
            group: {
                id: group._id,
                name: group.name,
                code: group.code,
                memberCount: group.memberCount,
                isEligible: group.isEligible,
                discountPercentage: group.discountPercentage,
                leader: { fullname: (group.leader as any).fullname },
            },
        });
    } catch (error) {
        console.error("Error getting group by code:", error);
        reply.status(500).send({ message: "Failed to get group", error });
    }
};

// Join group with code
export const joinGroup = async (
    req: FastifyRequest<{ Body: JoinGroupBody }>,
    reply: FastifyReply
) => {
    try {
        const userId = (req as any).user.id;
        const { code } = req.body;

        const group = await StudyGroup.findOne({ code: code.toUpperCase(), status: "active" });

        if (!group) {
            return reply.status(404).send({ message: "Group not found or inactive" });
        }

        // Check if already a member
        if (group.members.includes(userId)) {
            return reply.status(400).send({ message: "You are already a member of this group" });
        }

        // Check if user is in another group
        const existingMembership = await StudyGroup.findOne({
            members: userId,
            status: "active",
        });

        if (existingMembership) {
            return reply.status(400).send({
                message: "You are already in another group. Leave that group first.",
                existingGroup: {
                    id: existingMembership._id,
                    name: existingMembership.name,
                },
            });
        }

        // Add member
        group.members.push(userId);
        group.memberCount = group.members.length;

        // Check and update eligibility
        await updateGroupEligibility(group);

        await group.save();

        // Update user's studyGroup reference
        await User.findByIdAndUpdate(userId, { studyGroup: group._id });

        return reply.status(200).send({
            message: "Successfully joined the group",
            group: {
                id: group._id,
                name: group.name,
                memberCount: group.memberCount,
                isEligible: group.isEligible,
                discountPercentage: group.discountPercentage,
            },
        });
    } catch (error) {
        console.error("Error joining group:", error);
        reply.status(500).send({ message: "Failed to join group", error });
    }
};

// Leave group
export const leaveGroup = async (
    req: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
) => {
    try {
        const userId = (req as any).user.id;
        const { id } = req.params;

        const group = await StudyGroup.findById(id);

        if (!group) {
            return reply.status(404).send({ message: "Group not found" });
        }

        // Check if user is a member
        if (!group.members.includes(userId)) {
            return reply.status(400).send({ message: "You are not a member of this group" });
        }

        // Leader cannot leave (must archive group instead)
        if (group.leader.toString() === userId) {
            return reply.status(400).send({
                message: "Group leader cannot leave. Archive the group instead.",
            });
        }

        // Remove member
        group.members = group.members.filter((m: any) => m.toString() !== userId);
        group.memberCount = group.members.length;

        // Update eligibility
        await updateGroupEligibility(group);

        await group.save();

        // Remove user's studyGroup reference
        await User.findByIdAndUpdate(userId, { studyGroup: null });

        return reply.status(200).send({
            message: "Successfully left the group",
        });
    } catch (error) {
        console.error("Error leaving group:", error);
        reply.status(500).send({ message: "Failed to leave group", error });
    }
};

// Remove member (leader only)
export const removeMember = async (
    req: FastifyRequest<{ Params: { id: string; memberId: string } }>,
    reply: FastifyReply
) => {
    try {
        const userId = (req as any).user.id;
        const { id, memberId } = req.params;

        const group = await StudyGroup.findById(id);

        if (!group) {
            return reply.status(404).send({ message: "Group not found" });
        }

        // Only leader can remove members
        if (group.leader.toString() !== userId) {
            return reply.status(403).send({ message: "Only group leader can remove members" });
        }

        // Cannot remove self (use archive instead)
        if (memberId === userId) {
            return reply.status(400).send({ message: "Cannot remove yourself. Archive the group instead." });
        }

        // Check if member exists
        if (!group.members.some((m: any) => m.toString() === memberId)) {
            return reply.status(400).send({ message: "User is not a member of this group" });
        }

        // Remove member
        group.members = group.members.filter((m: any) => m.toString() !== memberId);
        group.memberCount = group.members.length;

        // Update eligibility
        await updateGroupEligibility(group);

        await group.save();

        // Remove member's studyGroup reference
        await User.findByIdAndUpdate(memberId, { studyGroup: null });

        return reply.status(200).send({
            message: "Member removed successfully",
            newMemberCount: group.memberCount,
            isEligible: group.isEligible,
        });
    } catch (error) {
        console.error("Error removing member:", error);
        reply.status(500).send({ message: "Failed to remove member", error });
    }
};

// Archive group (leader only)
export const archiveGroup = async (
    req: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
) => {
    try {
        const userId = (req as any).user.id;
        const { id } = req.params;

        const group = await StudyGroup.findById(id);

        if (!group) {
            return reply.status(404).send({ message: "Group not found" });
        }

        if (group.leader.toString() !== userId) {
            return reply.status(403).send({ message: "Only group leader can archive the group" });
        }

        group.status = "archived";
        await group.save();

        // Remove all members' studyGroup references
        await User.updateMany(
            { _id: { $in: group.members } },
            { studyGroup: null }
        );

        return reply.status(200).send({
            message: "Group archived successfully",
        });
    } catch (error) {
        console.error("Error archiving group:", error);
        reply.status(500).send({ message: "Failed to archive group", error });
    }
};

// Send invitations (leader only)
export const sendInvitations = async (
    req: FastifyRequest<{ Params: { id: string }; Body: InviteMembersBody }>,
    reply: FastifyReply
) => {
    try {
        const userId = (req as any).user.id;
        const { id } = req.params;
        const { emails } = req.body;

        const group = await StudyGroup.findById(id).populate("leader", "fullname email");

        if (!group) {
            return reply.status(404).send({ message: "Group not found" });
        }

        if (group.leader._id.toString() !== userId) {
            return reply.status(403).send({ message: "Only group leader can send invitations" });
        }

        const results = {
            sent: [] as string[],
            failed: [] as { email: string; reason: string }[],
        };

        for (const email of emails) {
            // Check if already a member
            const existingUser = await User.findOne({ email: email.toLowerCase() });
            if (existingUser && group.members.some((m: any) => m.toString() === (existingUser as any)._id.toString())) {
                results.failed.push({ email, reason: "Already a member" });
                continue;
            }

            // Check if invitation already pending
            const existingInvite = await GroupInvitation.findOne({
                group: id,
                inviteeEmail: email.toLowerCase(),
                status: "pending",
            });

            if (existingInvite) {
                results.failed.push({ email, reason: "Invitation already pending" });
                continue;
            }

            // Create invitation
            const token = (GroupInvitation as any).generateToken();
            const invitation = new GroupInvitation({
                group: id,
                invitedBy: userId,
                inviteeEmail: email.toLowerCase(),
                token,
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
            });

            await invitation.save();

            // Send email (async, don't wait)
            const inviteLink = `${process.env.FRONTEND_URL}/student/groups/join?invite=${token}`;
            sendGroupInvitationEmail(
                email,
                (group.leader as any).fullname,
                group.name,
                inviteLink
            ).catch(err => console.error("Failed to send invite email:", err));

            results.sent.push(email);
        }

        return reply.status(200).send({
            message: `Sent ${results.sent.length} invitation(s)`,
            results,
        });
    } catch (error) {
        console.error("Error sending invitations:", error);
        reply.status(500).send({ message: "Failed to send invitations", error });
    }
};

// Accept invitation by token
export const acceptInvitation = async (
    req: FastifyRequest<{ Params: { token: string } }>,
    reply: FastifyReply
) => {
    try {
        const userId = (req as any).user.id;
        const { token } = req.params;

        const invitation = await GroupInvitation.findOne({ token });

        if (!invitation) {
            return reply.status(404).send({ message: "Invitation not found" });
        }

        if (!invitation.isValid()) {
            return reply.status(400).send({ message: "Invitation has expired or already used" });
        }

        const group = await StudyGroup.findById(invitation.group);
        if (!group || group.status !== "active") {
            return reply.status(400).send({ message: "Group no longer exists or is inactive" });
        }

        // Check if already a member
        if (group.members.includes(userId)) {
            invitation.status = "accepted";
            invitation.acceptedBy = userId;
            invitation.acceptedAt = new Date();
            await invitation.save();
            return reply.status(400).send({ message: "You are already a member of this group" });
        }

        // Check if user is in another group
        const existingMembership = await StudyGroup.findOne({
            members: userId,
            status: "active",
        });

        if (existingMembership) {
            return reply.status(400).send({
                message: "You are already in another group. Leave that group first.",
            });
        }

        // Add member
        group.members.push(userId);
        group.memberCount = group.members.length;
        await updateGroupEligibility(group);
        await group.save();

        // Update invitation
        invitation.status = "accepted";
        invitation.acceptedBy = userId;
        invitation.acceptedAt = new Date();
        await invitation.save();

        // Update user's studyGroup reference
        await User.findByIdAndUpdate(userId, { studyGroup: group._id });

        return reply.status(200).send({
            message: "Successfully joined the group",
            group: {
                id: group._id,
                name: group.name,
                memberCount: group.memberCount,
                isEligible: group.isEligible,
                discountPercentage: group.discountPercentage,
            },
        });
    } catch (error) {
        console.error("Error accepting invitation:", error);
        reply.status(500).send({ message: "Failed to accept invitation", error });
    }
};

// Helper: Update group eligibility based on member count
async function updateGroupEligibility(group: any) {
    const rules = await DiscountRule.find({
        type: "group",
        isActive: true,
        $or: [
            { expiresAt: null },
            { expiresAt: { $gt: new Date() } },
        ],
    }).sort({ discountPercentage: -1 });

    // Find applicable rule
    const applicableRule = rules.find(r =>
        group.memberCount >= r.minThreshold &&
        (r.maxThreshold === null || group.memberCount <= r.maxThreshold)
    );

    if (applicableRule) {
        const wasEligible = group.isEligible;
        group.isEligible = true;
        group.discountTier = applicableRule.tier;
        group.discountPercentage = applicableRule.discountPercentage;

        if (!wasEligible) {
            group.eligibilityDate = new Date();
        }
    } else {
        group.isEligible = false;
        group.discountTier = null;
        group.discountPercentage = 0;
    }
}

// Helper: Send group invitation email
async function sendGroupInvitationEmail(
    email: string,
    inviterName: string,
    groupName: string,
    inviteLink: string
): Promise<void> {
    const subject = `You're invited to join "${groupName}" study group - Prayash Assets`;
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Group Invitation</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #3B82F6; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background-color: #f9f9f9; }
        .button { display: inline-block; padding: 12px 24px; background-color: #22C55E; color: white; 
                  text-decoration: none; border-radius: 6px; margin: 20px 0; }
        .footer { padding: 20px; text-align: center; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Study Group Invitation</h1>
        </div>
        <div class="content">
          <h2>Hello!</h2>
          <p><strong>${inviterName}</strong> has invited you to join their study group "<strong>${groupName}</strong>" on Prayash Assets.</p>
          
          <p>By joining this group, you can unlock exclusive group discounts on mock test packages!</p>
          
          <p style="text-align: center;">
            <a href="${inviteLink}" class="button">Accept Invitation</a>
          </p>
          
          <p><strong>⏰ This invitation expires in 7 days.</strong></p>
          
          <p>If you don't have an account yet, you'll be able to create one when you click the link.</p>
          
          <p>Best regards,<br>The Prayash Assets Team</p>
        </div>
        <div class="footer">
          <p>This is an automated email. Please do not reply to this message.</p>
        </div>
      </div>
    </body>
    </html>
  `;

    await emailService.sendEmail({
        to: email,
        subject,
        html,
        text: `${inviterName} has invited you to join their study group "${groupName}". Accept here: ${inviteLink}`,
    });
}
// Get all active study groups (simple list for dropdowns)
export const getAllActiveGroups = async (
    req: FastifyRequest,
    reply: FastifyReply
) => {
    try {
        const groups = await StudyGroup.find({ status: "active" })
            .select("name code _id")
            .sort({ name: 1 });
        reply.send(groups);
    } catch (error) {
        console.error("Error getting all active groups:", error);
        reply.status(500).send({ message: "Failed to get groups", error });
    }
};
