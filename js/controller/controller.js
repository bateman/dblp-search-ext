// controller.js
console.log("controller.js loaded");

export class PublicationController {
  constructor(model, view) {
    this.model = model;
    this.view = view;

    this.model.subscribe(() => {
      console.log(
        "Controller received notification from model to update the view: ",
        this.model.status,
        this.model.totalHits,
        this.model.sentHits,
        this.model.excludedCount,
        this.model.currentOffset
      );
      this.view.setCurrentOffset(this.model.currentOffset);
      this.view.update(
        this.model.status,
        this.model.publications,
        this.model.totalHits,
        this.model.sentHits,
        this.model.excludedCount
      );
    });
  }

  async handleSearch(query, offset = 0) {
    console.log(`Controller received query: ${query} (offset: ${offset})`);
    await this.model.searchPublications(query, offset);
  }

  async handleNextPage(query, currentOffset, maxResults) {
    const nextOffset = currentOffset + maxResults;
    await this.handleSearch(query, nextOffset);
  }

  async handlePreviousPage(query, currentOffset, maxResults) {
    const previousOffset = Math.max(0, currentOffset - maxResults);
    await this.handleSearch(query, previousOffset);
  }
}
