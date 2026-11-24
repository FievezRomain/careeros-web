import { z } from "zod";

const optionalTrimmed = (maximum: number) =>
  z.string().trim().max(maximum).optional();

const datedFields = {
  startDate: z.iso.date(),
  endDate: z.iso.date().optional(),
  current: z.boolean(),
} as const;

const experienceInputSchema = z.object({
  kind: z.literal("experience"),
  title: z.string().trim().min(1).max(200),
  employer: z.string().trim().min(1).max(200),
  description: optionalTrimmed(4000),
  ...datedFields,
});

const educationInputSchema = z.object({
  kind: z.literal("education"),
  institution: z.string().trim().min(1).max(200),
  qualification: z.string().trim().min(1).max(200),
  fieldOfStudy: optionalTrimmed(200),
  ...datedFields,
});

const skillInputSchema = z.object({
  kind: z.literal("skill"),
  name: z.string().trim().min(1).max(120),
  level: z.enum(["beginner", "intermediate", "advanced", "expert"]).optional(),
});

export const profileItemInputSchema = z
  .discriminatedUnion("kind", [
    experienceInputSchema,
    educationInputSchema,
    skillInputSchema,
  ])
  .superRefine((value, context) => {
    if (value.kind === "skill") return;
    if (value.current && value.endDate !== undefined) {
      context.addIssue({
        code: "custom",
        message: "A current item cannot have an end date.",
        path: ["endDate"],
      });
    }
    if (
      !value.current &&
      value.endDate !== undefined &&
      value.endDate < value.startDate
    ) {
      context.addIssue({
        code: "custom",
        message: "End date must be on or after the start date.",
        path: ["endDate"],
      });
    }
  });

const provenanceSchema = z.object({
  origin: z.enum([
    "directEntry",
    "resumeImport",
    "generatedSuggestion",
    "userCorrection",
  ]),
  sourceId: z.string().min(1).max(200).optional(),
  recordedAt: z.iso.datetime(),
});

const itemIdentitySchema = z.object({
  itemId: z.uuid(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  provenance: provenanceSchema,
  validationStatus: z.enum(["unconfirmed", "userConfirmed"]),
});

const experienceSchema = experienceInputSchema.extend(itemIdentitySchema.shape);
const educationSchema = educationInputSchema.extend(itemIdentitySchema.shape);
const skillSchema = skillInputSchema.extend({
  ...itemIdentitySchema.shape,
  levelSource: z.literal("selfDeclared").optional(),
});

export const profileItemSchema = z.discriminatedUnion("kind", [
  experienceSchema,
  educationSchema,
  skillSchema,
]);

export const profileItemPageSchema = z.object({
  items: z.array(profileItemSchema),
  page: z.object({ nextCursor: z.string().optional() }),
});

export type ProfileItemInput = Readonly<z.infer<typeof profileItemInputSchema>>;
export type ProfileItem = Readonly<z.infer<typeof profileItemSchema>>;
export type ProfileItemKind = ProfileItem["kind"];

export function inputFromItem(item: ProfileItem): ProfileItemInput {
  if (item.kind === "experience") {
    return {
      kind: item.kind,
      title: item.title,
      employer: item.employer,
      startDate: item.startDate,
      current: item.current,
      ...(item.description === undefined
        ? {}
        : { description: item.description }),
      ...(item.endDate === undefined ? {} : { endDate: item.endDate }),
    };
  }
  if (item.kind === "education") {
    return {
      kind: item.kind,
      institution: item.institution,
      qualification: item.qualification,
      startDate: item.startDate,
      current: item.current,
      ...(item.fieldOfStudy === undefined
        ? {}
        : { fieldOfStudy: item.fieldOfStudy }),
      ...(item.endDate === undefined ? {} : { endDate: item.endDate }),
    };
  }
  return {
    kind: item.kind,
    name: item.name,
    ...(item.level === undefined ? {} : { level: item.level }),
  };
}
