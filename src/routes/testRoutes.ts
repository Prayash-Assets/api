import { FastifyInstance } from "fastify";
import { Student } from "../models/User";
import Package from "../models/Package";

export default async function testRoutes(fastify: FastifyInstance) {
  // Test endpoint to assign package to user
  fastify.post("/assign-package", async (request, reply) => {
    try {
      const { userEmail, packageName } = request.body as { userEmail: string; packageName: string };
      
      // Find user
      const user = await Student.findOne({ email: userEmail });
      if (!user) {
        return reply.status(404).send({ error: "User not found" });
      }
      
      // Find package
      const pkg = await Package.findOne({ name: packageName });
      if (!pkg) {
        return reply.status(404).send({ error: "Package not found" });
      }
      
      // Check if already assigned
      const hasPackage = user.packages && user.packages.includes(pkg._id as any);
      if (hasPackage) {
        return reply.send({ message: "Package already assigned to user" });
      }
      
      // Assign package
      if (!user.packages) {
        user.packages = [];
      }
      user.packages.push(pkg._id as any);
      await user.save();
      
      reply.send({ 
        message: "Package assigned successfully",
        user: { email: user.email, packagesCount: user.packages.length },
        package: { name: pkg.name, id: pkg._id }
      });
    } catch (error: any) {
      reply.status(500).send({ error: error.message });
    }
  });
  
  // Test endpoint to check user packages
  fastify.get("/user-packages/:email", async (request, reply) => {
    try {
      const { email } = request.params as { email: string };
      
      const user = await Student.findOne({ email }).populate({
        path: "packages",
        select: "name description price published"
      });
      
      if (!user) {
        return reply.status(404).send({ error: "User not found" });
      }
      
      reply.send({
        user: { email: user.email, userType: user.userType },
        packages: user.packages || [],
        packagesCount: user.packages?.length || 0
      });
    } catch (error: any) {
      reply.status(500).send({ error: error.message });
    }
  });
}