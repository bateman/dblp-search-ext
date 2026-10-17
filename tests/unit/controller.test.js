import { describe, it, expect, vi, beforeEach } from "vitest";
import { PublicationController } from "../../js/controller/controller.js";

describe("PublicationController", () => {
  let controller;
  let mockModel;
  let mockView;
  const searchResult = { status: "OK", publications: [], currentOffset: 0 };
  const responseMessage = { type: "RESPONSE_SEARCH_PUBLICATIONS" };

  beforeEach(() => {
    mockModel = {
      searchPublications: vi.fn().mockResolvedValue(searchResult),
    };

    mockView = {
      render: vi.fn().mockReturnValue(responseMessage),
    };

    controller = new PublicationController(mockModel, mockView);
  });

  describe("constructor", () => {
    it("stores model and view references", () => {
      expect(controller.model).toBe(mockModel);
      expect(controller.view).toBe(mockView);
    });
  });

  describe("handleSearch", () => {
    it("delegates to model.searchPublications", async () => {
      await controller.handleSearch("test query");
      expect(mockModel.searchPublications).toHaveBeenCalledWith("test query", 0);
    });

    it("passes offset to model", async () => {
      await controller.handleSearch("test query", 30);
      expect(mockModel.searchPublications).toHaveBeenCalledWith("test query", 30);
    });

    it("returns the view's response built from the model's result", async () => {
      await expect(controller.handleSearch("query")).resolves.toBe(responseMessage);
      expect(mockView.render).toHaveBeenCalledWith(searchResult);
    });

    it("uses default offset of 0", async () => {
      await controller.handleSearch("query");
      expect(mockModel.searchPublications).toHaveBeenCalledWith("query", 0);
    });
  });

  describe("handleNextPage", () => {
    it("calculates correct next offset", async () => {
      await controller.handleNextPage("query", 0, 30);
      expect(mockModel.searchPublications).toHaveBeenCalledWith("query", 30);
    });

    it("adds maxResults to current offset", async () => {
      await controller.handleNextPage("query", 30, 30);
      expect(mockModel.searchPublications).toHaveBeenCalledWith("query", 60);
    });

    it("returns the response for the next page", async () => {
      await expect(controller.handleNextPage("query", 0, 30)).resolves.toBe(responseMessage);
    });

    it("works with different page sizes", async () => {
      await controller.handleNextPage("query", 0, 10);
      expect(mockModel.searchPublications).toHaveBeenCalledWith("query", 10);
    });
  });

  describe("handlePreviousPage", () => {
    it("calculates correct previous offset", async () => {
      await controller.handlePreviousPage("query", 60, 30);
      expect(mockModel.searchPublications).toHaveBeenCalledWith("query", 30);
    });

    it("clamps offset to 0 when going below zero", async () => {
      await controller.handlePreviousPage("query", 10, 30);
      expect(mockModel.searchPublications).toHaveBeenCalledWith("query", 0);
    });

    it("returns to offset 0 from first page", async () => {
      await controller.handlePreviousPage("query", 0, 30);
      expect(mockModel.searchPublications).toHaveBeenCalledWith("query", 0);
    });

    it("returns the response for the previous page", async () => {
      await expect(controller.handlePreviousPage("query", 30, 30)).resolves.toBe(responseMessage);
    });

    it("handles exact page boundary", async () => {
      await controller.handlePreviousPage("query", 30, 30);
      expect(mockModel.searchPublications).toHaveBeenCalledWith("query", 0);
    });
  });
});
