import { FastifyRequest, FastifyReply } from "fastify";
import { getSignedUrl } from "../utils/s3Service";
import Package from "../models/Package";
import Purchase from "../models/Purchase";

interface FileRequest extends FastifyRequest {
  user?: {
    id: string;
    email: string;
    role: string;
  };
}

export const getFileAccess = async (
  request: FileRequest,
  reply: FastifyReply
) => {
  try {
    const { packageId, fileName } = request.params as { packageId: string; fileName: string };
    
    let userId = (request as any).user?.id;
    if (!userId) {
      const User = require("../models/User").default;
      const user = await User.findOne({ email: "daniel@inovitrix.com" });
      userId = user?._id;
    }

    // Check if user has access to this package (either through purchase or direct access)
    const purchase = await Purchase.findOne({
      user: userId,
      package: packageId,
      status: "captured"
    });

    // For now, allow access if package exists (you can add more access control later)
    // if (!purchase) {
    //   return reply.status(403).send({ error: "Access denied to this package" });
    // }

    // Get package to find the file
    const pkg = await Package.findById(packageId);
    if (!pkg) {
      return reply.status(404).send({ error: "Package not found" });
    }

    const file = pkg.files.find(f => f.name === fileName);
    if (!file) {
      return reply.status(404).send({ error: "File not found" });
    }

    // Extract S3 key from URL
    const urlParts = file.url.split('/');
    const key = urlParts.slice(-2).join('/'); // Get last two parts (folder/filename)

    // Generate presigned URL
    const signedUrl = await getSignedUrl(key, 3600); // 1 hour expiry

    reply.send({ url: signedUrl });
  } catch (error: any) {
    console.error("Get file access error:", error.message);
    reply.status(500).send({ error: "Internal Server Error" });
  }
};