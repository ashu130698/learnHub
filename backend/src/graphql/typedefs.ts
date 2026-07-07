import { gql } from "graphql-tag";

// gql is a template literal tag that parses GraphQL SDL (Schema Definition Language)
// SDL is the language you use to define types, queries, and mutations
// Apollo Server reads this and builds the schema from it
export const typeDefs = gql`
  # ── Enums ────────────────────────────────────────────────────
  # Enums restrict a field to a fixed set of values
  # GraphQL enforces this — sending an invalid value throws an error automatically

  enum Role {
    USER
    ADMIN
  }
  enum Difficulty {
    BEGINNER
    INTERMEDIATE
    ADVANCED
  }
  enum LessonType {
    READING
    VIDEO
  }
  enum ProgressStatus {
    NOT_STARTED
    IN_PROGRESS
    COMPLETED
  }
  enum QuestionType {
    MCQ
    TRUE_FALSE
    MULTI_SELECT
  }

  # ── Object Types ─────────────────────────────────────────────
  # These mirror your MongoDB models with deliberate omissions:
  # - No passwordHash anywhere
  # - No correctAnswers on Question (only on QuestionResult after submission)
  # - No explanation on Question (only revealed post-submission)

  type Profile {
    name: String!
    avatarUrl: String # optional — no !
  }

  type User {
    id: ID!
    email: String!
    role: Role!
    profile: Profile!
    createdAt: String!
  }

  type Lesson {
    id: ID!
    title: String!
    contentUrl: String!
    order: Int!
    type: LessonType!
  }

  type Module {
    id: ID!
    slug: String!
    title: String!
    description: String!
    order: Int!
    difficulty: Difficulty!
    estimatedMins: Int!
    lessons: [Lesson!]!
    tags: [String!]!
    isPublished: Boolean!
    # Resolved per logged-in user — null if not authenticated
    userProgress: Progress
  }

  type Option {
    id: String!
    text: String!
  }

  # Question returned during quiz FETCH — correctAnswers intentionally absent
  type Question {
    id: ID!
    text: String!
    type: QuestionType!
    options: [Option!]!
    points: Int!
  }

  type Quiz {
    id: ID!
    moduleId: ID!
    title: String!
    passingScore: Int!
    questions: [Question!]!
  }

  # QuestionResult returned AFTER submission — correctAnswers now visible
  type QuestionResult {
    questionId: ID!
    isCorrect: Boolean!
    explanation: String!
    correctAnswers: [String!]!
  }

  type Attempt {
    id: ID!
    quizId: ID!
    moduleId: ID!
    score: Float!
    passed: Boolean!
    timeTakenSecs: Int!
    createdAt: String!
    breakdown: [QuestionResult!]!
  }

  type Progress {
    moduleId: ID!
    completedLessons: [ID!]!
    status: ProgressStatus!
    startedAt: String
    completedAt: String
    lastAccessedAt: String!
  }

  type DashboardData {
    totalModules: Int!
    completedModules: Int!
    inProgressModules: Int!
    recentAttempts: [Attempt!]!
    overallScore: Float!
  }

  # Returned by login and register
  # accessToken goes to JS memory on client
  # refresh token is set as HttpOnly cookie server-side — not in this type
  type AuthPayload {
    accessToken: String!
    user: User!
  }

  # ── Input Types ───────────────────────────────────────────────
  # Input types are used for mutation arguments
  # Separate from object types — GraphQL enforces this distinction

  input RegisterInput {
    email: String!
    password: String!
    name: String!
  }

  input LoginInput {
    email: String!
    password: String!
  }

  input AnswerInput {
    questionId: ID!
    selectedAnswers: [String!]!
  }

  input SubmitQuizInput {
    quizId: ID!
    moduleId: ID!
    answers: [AnswerInput!]!
    timeTakenSecs: Int!
  }

  # ── Queries ───────────────────────────────────────────────────
  # Queries = read operations (like GET in REST)
  # Public queries work without auth
  # Auth-required queries throw UNAUTHENTICATED if no valid JWT

  type Query {
    # Public
    modules(difficulty: Difficulty, tag: String): [Module!]!
    module(slug: String!): Module

    # Auth required
    me: User!
    quiz(moduleId: ID!): Quiz
    myAttempts(moduleId: ID): [Attempt!]!
    dashboard: DashboardData!
  }

  # ── Mutations ─────────────────────────────────────────────────
  # Mutations = write operations (like POST/PUT/DELETE in REST)

  type Mutation {
    # Auth
    register(input: RegisterInput!): AuthPayload!
    login(input: LoginInput!): AuthPayload!
    logout: Boolean!
    refreshToken: AuthPayload!

    # Progress
    markLessonComplete(lessonId: ID!, moduleId: ID!): Progress!

    # Quiz
    submitQuiz(input: SubmitQuizInput!): Attempt!
  }
`;
