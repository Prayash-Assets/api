import { FastifyRequest, FastifyReply } from "fastify";
import Category, { ICategory } from "../models/Category";
import { Question } from "../models/Question";

/**
 * Creates a new category.
 * @param request - The Fastify request object, containing the category name and value in the body.
 * @param reply - The Fastify reply object.
 * @returns A new category object or an error message.
 */
export const createCategory = async (
  request: FastifyRequest<{ Body: ICategory }>,
  reply: FastifyReply
) => {
  try {
    const { name, value } = request.body;
    const existingCategory = await Category.findOne({
      $or: [{ name }, { value }],
    });
    if (existingCategory) {
      return reply
        .status(400)
        .send({ message: "Category with this name or value already exists" });
    }
    const newCategory = new Category({ name, value });
    await newCategory.save();
    reply.status(201).send(newCategory);
  } catch (error) {
    reply.status(500).send({ message: "Error creating category", error });
  }
};

/**
 * Retrieves all categories with question counts.
 * @param request - The Fastify request object.
 * @param reply - The Fastify reply object.
 * @returns An array of category objects with question counts or an error message.
 */
export const getAllCategories = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const categories = await Category.find();

    // Get question counts for each category
    const categoriesWithCounts = await Promise.all(
      categories.map(async (category) => {
        const questionCount = await Question.countDocuments({
          category_id: category._id,
        });
        return {
          ...category.toObject(),
          questionCount,
        };
      })
    );

    reply.send(categoriesWithCounts);
  } catch (error) {
    reply.status(500).send({ message: "Error fetching categories", error });
  }
};

/**
 * Retrieves a category by its ID with question count.
 * @param request - The Fastify request object, containing the category ID in the params.
 * @param reply - The Fastify reply object.
 * @returns A category object with question count or an error message if not found.
 */
export const getCategoryById = async (
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) => {
  try {
    const category = await Category.findById(request.params.id);
    if (!category) {
      return reply.status(404).send({ message: "Category not found" });
    }

    const questionCount = await Question.countDocuments({
      category_id: category._id,
    });

    const categoryWithCount = {
      ...category.toObject(),
      questionCount,
    };

    reply.send(categoryWithCount);
  } catch (error) {
    reply.status(500).send({ message: "Error fetching category", error });
  }
};

/**
 * Updates an existing category by its ID.
 * @param request - The Fastify request object, containing the category ID in the params and updated data in the body.
 * @param reply - The Fastify reply object.
 * @returns The updated category object or an error message if not found or if uniqueness is violated.
 */
export const updateCategory = async (
  request: FastifyRequest<{ Params: { id: string }; Body: ICategory }>,
  reply: FastifyReply
) => {
  try {
    const { name, value } = request.body;
    const updatedCategory = await Category.findByIdAndUpdate(
      request.params.id,
      { name, value },
      { new: true, runValidators: true }
    );
    if (!updatedCategory) {
      return reply.status(404).send({ message: "Category not found" });
    }
    // Check for uniqueness of name and value if they are being changed
    if (name || value) {
      const existingCategory = await Category.findOne({
        $or: [{ name }, { value }],
        _id: { $ne: request.params.id }, // Exclude the current document
      });
      if (existingCategory) {
        return reply
          .status(400)
          .send({ message: "Category with this name or value already exists" });
      }
    }
    reply.send(updatedCategory);
  } catch (error: any) {
    if (error.code === 11000 || error.message.includes("duplicate key")) {
      reply.status(400).send({
        message: "Category with this name or value already exists",
        error: error.keyValue,
      });
    } else {
      reply.status(500).send({ message: "Error updating category", error });
    }
  }
};

/**
 * Deletes a category by its ID.
 * @param request - The Fastify request object, containing the category ID in the params.
 * @param reply - The Fastify reply object.
 * @returns A success message or an error message if not found.
 */
export const deleteCategory = async (
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) => {
  try {
    const deletedCategory = await Category.findByIdAndDelete(request.params.id);
    if (!deletedCategory) {
      return reply.status(404).send({ message: "Category not found" });
    }
    reply.send({ message: "Category deleted successfully" });
  } catch (error) {
    reply.status(500).send({ message: "Error deleting category", error });
  }
};
