import { FastifyRequest, FastifyReply } from "fastify";
import Level, { ILevel } from "../models/Level";
import { Question } from "../models/Question";
import mongoose from "mongoose";

/**
 * Creates a new level.
 * @param request - The Fastify request object, containing the level name in the body.
 * @param reply - The Fastify reply object.
 * @returns A new level object or an error message.
 */
export const createLevel = async (
  request: FastifyRequest<{ Body: ILevel }>,
  reply: FastifyReply
) => {
  try {
    const { name, value } = request.body;
    const existingLevel = await Level.findOne({ name });
    if (existingLevel) {
      return reply.status(400).send({ message: "Level already exists" });
    }
    const newLevel = new Level({ name, value });
    await newLevel.save();
    reply.status(200).send(newLevel);
  } catch (error) {
    console.log("Error creating level:", error),
      reply.status(500).send({
        message:
          "Error creating level Allowed Levels: National and International",
        error,
      });
  }
};

/**
 * Get all levels with question counts.
 * @param request - The Fastify request object.
 * @param reply - The Fastify reply object.
 * @returns An array of level objects with question counts or an error message.
 */
export const getAllLevels = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const levels = await Level.find();

    // Get question counts for each level
    const levelsWithCounts = await Promise.all(
      levels.map(async (level) => {
        const questionCount = await Question.countDocuments({
          level_id: level._id,
        });
        return {
          ...level.toObject(),
          questionCount,
        };
      })
    );

    reply.status(200).send(levelsWithCounts);
  } catch (error) {
    reply.status(500).send({ message: "Error fetching levels", error });
  }
};

/**
 * Get a level by ID with question count.
 * @param request - The Fastify request object, containing the level ID in the params.
 * @param reply - The Fastify reply object.
 * @returns A level object with question count or an error message.
 */
export const getLevelById = async (
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) => {
  try {
    const level = await Level.findById(request.params.id);
    if (!level) {
      return reply.status(404).send({ message: "Level not found" });
    }

    const questionCount = await Question.countDocuments({
      level_id: level._id,
    });

    const levelWithCount = {
      ...level.toObject(),
      questionCount,
    };

    reply.status(200).send(levelWithCount);
  } catch (error) {
    reply.status(500).send({ message: "Error fetching level", error });
  }
};

/**
 * Update a level by ID.
 * @param request - The Fastify request object, containing the level ID in the params and updated data in the body.
 * @param reply - The Fastify reply object.
 * @returns The updated level object or an error message.
 */
export const updateLevel = async (
  request: FastifyRequest<{
    Params: { id: string; value: string };
    Body: Partial<ILevel>;
  }>,
  reply: FastifyReply
) => {
  try {
    const { name, value } = request.body;
    console.log("Updating level with ID:", request.params.id);
    // Check if the level exists
    if (!mongoose.Types.ObjectId.isValid(request.params.id)) {
      return reply.status(400).send({ message: "Invalid level ID" });
    }
    const existingLevel = await Level.findById(request.params.id);
    console.log("Existing level:", existingLevel);
    if (!existingLevel) {
      return reply.status(404).send({ message: "Level not found" });
    }

    // If name is being changed, check if new name already exists
    if (name && existingLevel && name !== existingLevel.name) {
      const nameExists = await Level.findOne({ name });
      if (nameExists) {
        return reply
          .status(400)
          .send({ message: "Level with this name already exists" });
      }
    }

    const updatedLevel = await Level.findByIdAndUpdate(
      request.params.id,
      request.body,
      { new: true, runValidators: true }
    );

    reply.status(200).send(updatedLevel);
  } catch (error) {
    reply.status(500).send({ message: "Error updating level", error });
  }
};

/**
 * Delete a level by ID.
 * @param request - The Fastify request object, containing the level ID in the params.
 * @param reply - The Fastify reply object.
 * @returns A success message or an error message if not found or if referenced.
 */
export const deleteLevel = async (
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) => {
  try {
    const levelId = request.params.id;
    
    // Check if level is referenced by any questions
    const questionCount = await Question.countDocuments({
      level_id: levelId,
    });
    
    if (questionCount > 0) {
      return reply.status(409).send({
        message: `Cannot delete level. It is referenced by ${questionCount} question${questionCount > 1 ? "s" : ""}. Please remove or reassign these questions first.`,
        error: "LEVEL_IN_USE",
        referencedCount: questionCount,
      });
    }
    
    const deletedLevel = await Level.findByIdAndDelete(levelId);
    if (!deletedLevel) {
      return reply.status(404).send({ message: "Level not found" });
    }
    reply.status(200).send({ message: "Level deleted successfully" });
  } catch (error) {
    reply.status(500).send({ message: "Error deleting level", error });
  }
};
