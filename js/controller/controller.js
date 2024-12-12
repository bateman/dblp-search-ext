// controller.js
console.log("controller.js loaded");

export class PublicationController {
    constructor(model, view) {
        this.model = model;
        this.view = view;

        this.model.subscribe(() => {
            console.log('Controller received notification from model to update the view: ', 
                        this.model.status, 
                        this.model.totalHits, 
                        this.model.sentHits,
                        this.model.excludedCount);
            this.view.update(this.model.status, 
                            this.model.publications, 
                            this.model.totalHits, 
                            this.model.sentHits,
                            this.model.excludedCount);
        });
    }

    async handleSearch(query) {
        console.log(`Controller received query: ${query}`);
        await this.model.searchPublications(query);
    }
}