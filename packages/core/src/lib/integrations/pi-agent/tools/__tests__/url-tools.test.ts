import path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dataRoot = path.resolve("C:/OriginOS/data");

vi.mock("../../../../paths", () => ({
	getDataRoot: () => dataRoot,
}));

vi.mock("../context", () => ({
	getToolContext: () => ({
		workingDirectory: path.join(dataRoot, "skills", "candidate-evaluator"),
	}),
}));

import { urlTools } from "../url-tools";

describe("generate_file_url", () => {
	const tool = urlTools.find((candidate) => candidate.name === "generate_file_url");

	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("is disabled so Agents use open_file instead", () => {
		expect(tool?.enabled).toBe(false);
	});

	it("resolves a data-prefixed path from the data root", async () => {
		const result = await tool?.execute(
			"call-1",
			{
				baseUrl: "",
				filePath: "data/skills/candidate-evaluator/output/report.md",
			},
		);

		expect(result?.details).toMatchObject({
			success: true,
			relativePath: "skills/candidate-evaluator/output/report.md",
		});
	});

	it("rejects traversal outside the data root", async () => {
		const result = await tool?.execute(
			"call-2",
			{ filePath: "../../../outside.txt" },
		);

		expect(result?.details).toMatchObject({
			success: false,
		});
	});
});
