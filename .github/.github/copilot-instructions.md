# GitHub Copilot Configuration File

# This file is used to define project-specific rules and guidelines for GitHub Copilot.

# Exclude specific files or directories from being used as context for Copilot suggestions.
exclude:
  - node_modules/
  - dist/
  - build/
  - .git/
  - .env

# Define preferred languages for Copilot suggestions.
languages:
  - typescript
  - javascript

# Set rules for code style and formatting.
code_style:
  indent_style: space
  indent_size: 2
  max_line_length: 80

# Enable or disable Copilot for specific file types.
enabled_file_types:
  - .ts
  - .js
  - .json
  - .md

disabled_file_types:
  - .log
  - .txt

# Add any additional notes or guidelines for contributors.
notes:
  - "Follow the project's coding standards and guidelines."
  - "Ensure all code changes are reviewed before merging."
  - "Use meaningful commit messages."
  - "Keep the codebase clean and well-organized."
  - "Aways use fastify for server-side code."
  - "Implement Models using mongoose"
