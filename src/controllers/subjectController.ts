import { FastifyRequest, FastifyReply } from "fastify";
import Subject, { ISubject } from "../models/Subject";
import { Question } from "../models/Question";

/**
 * Creates a new subject.
 * @param request - The Fastify request object, containing the subject name and value in the body.
 * @param reply - The Fastify reply object.
 * @returns A new subject object or an error message.
 */
export const createSubject = async (
  request: FastifyRequest<{ Body: ISubject }>,
  reply: FastifyReply
) => {
  try {
    const { name, value } = request.body;
    const existingSubject = await Subject.findOne({
      $or: [{ name }, { value }],
    });
    if (existingSubject) {
      return reply
        .status(400)
        .send({ message: "Subject with this name or value already exists" });
    }
    const newSubject = new Subject({ name, value });
    await newSubject.save();
    reply.status(201).send(newSubject);
  } catch (error) {
    reply.status(500).send({ message: "Error creating subject", error });
  }
};

/**
 * Retrieves all subjects with question counts.
 * @param request - The Fastify request object.
 * @param reply - The Fastify reply object.
 * @returns An array of subject objects with question counts or an error message.
 */
export const getAllSubjects = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const subjects = await Subject.find();

    // Get question counts for each subject
    const subjectsWithCounts = await Promise.all(
      subjects.map(async (subject) => {
        const questionCount = await Question.countDocuments({
          subject_id: subject._id,
        });
        return {
          ...subject.toObject(),
          questionCount,
        };
      })
    );

    reply.send(subjectsWithCounts);
  } catch (error) {
    reply.status(500).send({ message: "Error fetching subjects", error });
  }
};

/**
 * Retrieves a subject by its ID with question count.
 * @param request - The Fastify request object, containing the subject ID in the params.
 * @param reply - The Fastify reply object.
 * @returns A subject object with question count or an error message if not found.
 */
export const getSubjectById = async (
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) => {
  try {
    const subject = await Subject.findById(request.params.id);
    if (!subject) {
      return reply.status(404).send({ message: "Subject not found" });
    }

    const questionCount = await Question.countDocuments({
      subject_id: subject._id,
    });

    const subjectWithCount = {
      ...subject.toObject(),
      questionCount,
    };

    reply.send(subjectWithCount);
  } catch (error) {
    reply.status(500).send({ message: "Error fetching subject", error });
  }
};

/**
 * Updates an existing subject by its ID.
 * @param request - The Fastify request object, containing the subject ID in the params and updated data in the body.
 * @param reply - The Fastify reply object.
 * @returns The updated subject object or an error message if not found or if uniqueness is violated.
 */
export const updateSubject = async (
  request: FastifyRequest<{ Params: { id: string }; Body: ISubject }>,
  reply: FastifyReply
) => {
  try {
    const { name, value } = request.body;
    const updatedSubject = await Subject.findByIdAndUpdate(
      request.params.id,
      { name, value },
      { new: true, runValidators: true }
    );
    if (!updatedSubject) {
      return reply.status(404).send({ message: "Subject not found" });
    }
    // Check for uniqueness of name and value if they are being changed
    if (name || value) {
      const existingSubject = await Subject.findOne({
        $or: [{ name }, { value }],
        _id: { $ne: request.params.id }, // Exclude the current document
      });
      if (existingSubject) {
        return reply
          .status(400)
          .send({ message: "Subject with this name or value already exists" });
      }
    }
    reply.send(updatedSubject);
  } catch (error: any) {
    if (error.code === 11000 || error.message.includes("duplicate key")) {
      // Handle duplicate key error from MongoDB
      reply.status(400).send({
        message: "Subject with this name or value already exists",
        error: error.keyValue,
      });
    } else {
      reply.status(500).send({ message: "Error updating subject", error });
    }
  }
};

/**
 * Deletes a subject by its ID.
 * @param request - The Fastify request object, containing the subject ID in the params.
 * @param reply - The Fastify reply object.
 * @returns A success message or an error message if not found or if referenced.
 */
export const deleteSubject = async (
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) => {
  try {
    const subjectId = request.params.id;
    
    // Check if subject is referenced by any questions
    const questionCount = await Question.countDocuments({
      subject_id: subjectId,
    });
    
    if (questionCount > 0) {
      return reply.status(409).send({
        message: `Cannot delete subject. It is referenced by ${questionCount} question${questionCount > 1 ? "s" : ""}. Please remove or reassign these questions first.`,
        error: "SUBJECT_IN_USE",
        referencedCount: questionCount,
      });
    }
    
    const deletedSubject = await Subject.findByIdAndDelete(subjectId);
    if (!deletedSubject) {
      return reply.status(404).send({ message: "Subject not found" });
    }
    reply.send({ message: "Subject deleted successfully" });
  } catch (error) {
    reply.status(500).send({ message: "Error deleting subject", error });
  }
};
