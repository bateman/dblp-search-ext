import { describe, it, expect, vi, beforeEach } from "vitest";
import { PublicationController } from "../../js/controller/controller.js";

describe("PublicationController", () => {
  let controller;
  let mockModel;
  let mockView;

  beforeEach(() => {
    mockModel = {
      subscribe: vi.fn(),
      searchPublications: vi.fn().mockResolvedValue(undefined),
      status: "OK",
      publications: [],
      totalHits: 0,
      sentHits: 0,
      excludedCount: 0,
      currentOffset: 0,
    };

    mockView = {
      setCurrentOffset: vi.fn(),
      update: vi.fn(),
    };

    controller = new PublicationController(mockModel, mockView);
  });

  describe("constructor", () => {
    it("stores model and view references", () => {
      expect(controller.model).toBe(mockModel);
      expect(controller.view).toBe(mockView);
    });

    it("subscribes to model changes", () => {
      expect(mockModel.subscribe).toHaveBeenCalledOnce();
      expect(mockModel.subscribe).toHaveBeenCalledWith(expect.any(Function));
    });

    it("updates view when model notifies", () => {
      // Get the callback that was passed to subscribe
      const callback = mockModel.subscribe.mock.calls[0][0];

      mockModel.status = "OK";
      mockModel.publications = [{ title: "Test" }];
      mockModel.totalHits = 1;
      mockModel.sentHits = 1;
      mockModel.excludedCount = 0;
      mockModel.currentOffset = 10;

      callback();

      expect(mockView.setCurrentOffset).toHaveBeenCalledWith(10);
      expect(mockView.update).toHaveBeenCalledWith("OK", [{ title: "Test" }], 1, 1, 0);
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

    it("handles exact page boundary", async () => {
      await controller.handlePreviousPage("query", 30, 30);
      expect(mockModel.searchPublications).toHaveBeenCalledWith("query", 0);
    });
  });
});
