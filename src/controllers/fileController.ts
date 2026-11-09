import { FastifyReply } from "fastify";
import { getSignedUrl } from "../utils/s3Service";
import Package from "../models/Package";
import Purchase from "../models/Purchase";
import { AuthenticatedRequest } from "../middleware/rbacMiddleware";

export const getFileAccess = async (
  request: AuthenticatedRequest,
  reply: FastifyReply
) => {
  try {
    const { packageId, fileName } = request.params as {
      packageId: string;
      fileName: string;
    };

    const userId = request.user?.id;
    if (!userId) {
      return reply.status(401).send({ error: "Authentication required" });
    }

    const isAdmin =
      request.user?.userType?.toLowerCase() === "admin" ||
      request.user?.roles?.some(
        (r: string) => String(r).toLowerCase() === "admin"
      );

    if (!isAdmin) {
      const purchase = await Purchase.findOne({
        user: userId,
        package: packageId,
        status: "captured",
      });

      if (!purchase) {
        return reply
          .status(403)
          .send({ error: "Access denied to this package" });
      }
    }

    const pkg = await Package.findById(packageId);
    if (!pkg) {
      return reply.status(404).send({ error: "Package not found" });
    }

    const file = pkg.files.find((f) => f.name === fileName);
    if (!file) {
      return reply.status(404).send({ error: "File not found" });
    }

    const urlParts = file.url.split("/");
    const key = urlParts.slice(-2).join("/");

    const signedUrl = await getSignedUrl(key, 3600);

    reply.send({ url: signedUrl });
  } catch (error: any) {
    console.error("Get file access error:", error.message);
    reply.status(500).send({ error: "Internal Server Error" });
  }
};
