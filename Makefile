.SHELLARGS = -eu -c

DEFAULT_GOAL := help

APPNAME = dblpSearch

.PHONY: help clean tag del-tag patch minor major

help:
	@echo "help      - show this help"
	@echo "firefox   - build Firefox addon"
	@echo "safari    - build Safari extension"
	@echo "chrome    - build Chrome extension"
	@echo "all       - build all"
	@echo "minor     - bump minor version"
	@echo "major     - bump major version"
	@echo "patch     - bump patch version"
	@echo "tag       - tag the current version and push to origin"
	@echo "del-tag   - delete the current tag and push to origin"
	@echo "clean     - clean up dist directory"

firefox:
	@echo "Building Firefox addon"
	$(eval version=$(shell jq -r .version manifest.json))
	mkdir -p ./dist/firefox > /dev/null
	# rename default manifest.json
	mv manifest.json manifest.json.tmp
	# create a new manifest.json for Firefox
	mv manifest.firefox.json manifest.json
	zip -r -FS ./dist/firefox/$(APPNAME)-addon-$(version).xpi . --exclude "*.tmp" "geckoid.manifest.json"  "*.git*" "Makefile" "README.md" "PRIVACY.md" "dist/*" ".DS_Store" "images/.DS_Store" ".vscode/*" "store/*"
	zip -r -FS ./dist/firefox/$(APPNAME)-addon-$(version)-sources.zip ./js/*
	# restore default manifest.json
	mv manifest.json manifest.firefox.json
	mv manifest.json.tmp manifest.json

safari:
	@echo "Building Safari extension"
	$(eval version=$(shell jq -r .version manifest.json))
	$(eval PWD=$(shell pwd))
	mkdir -p $(PWD)/dist/safari > /dev/null
	mkdir -p $(PWD)/dist/safari/build > /dev/null
	mkdir -p $(PWD)/dist/safari/src > /dev/null
	mkdir -p $(PWD)/dist/safari/pkg > /dev/null
	cp *.html $(PWD)/dist/safari/src 
	cp manifest.json $(PWD)/dist/safari/src 
	cp -r images $(PWD)/dist/safari/src 
	cp -r js $(PWD)/dist/safari/src 
	cp -r css $(PWD)/dist/safari/src 
	xcrun safari-web-extension-converter $(PWD)/dist/safari/src --app-name "$(APPNAME)" --bundle-identifier "dev.fcalefato.$(APPNAME)" --project-location dist/safari --no-prompt --no-open --force --macos-only
	#cd $(PWD)/dist/safari/$(APPNAME) && xcodebuild -scheme $(APPNAME) -archivePath dist/safari/build/$(APPNAME).xcarchive build
	#cd $(PWD)/dist/safari/$(APPNAME) && xcodebuild archive -scheme $(APPNAME) -archivePath dist/safari/build/$(APPNAME).xcarchive
	# cd $(PWD)/dist/safari/$(APPNAME) && xcodebuild -exportArchive -archivePath dist/safari/build/$(APPNAME).xcarchive -exportPath dist/safari/pkg/$(APPNAME).pkg -exportOptionsPlist ExportOptions.plist
	cd $(PWD)/dist/safari/$(APPNAME) &&  xcodebuild -target $(APPNAME) -configuration Release clean build
	#cd $(PWD)/dist/safari/$(APPNAME) &&  pkgbuild --root build/Release --identifier "dev.fcalefato.$(APPNAME)" --version $(version) ../pkg/$(APPNAME)-$(version).pkg
	zip dist/safari/$(APPNAME)-appex-$(version).zip dist/safari/$(APPNAME)/build/Release/$(APPNAME).app

chrome:
	@echo "Building Chrome extension"
	$(eval version=$(shell jq -r .version manifest.json))
	mkdir -p ./dist/chrome > /dev/null
	zip -r -FS ./dist/chrome/$(APPNAME)-ext-$(version).zip . --exclude "*.git*" "Makefile" "README.md" "dist/*" ".DS_Store" ".vscode/*" "store/*" "images/.DS_Store"

clean:
	@echo "Cleaning up dist/ directory..."
	rm -rf ./dist/firefox
	rm -rf ./dist/safari
	rm -rf ./dist/chrome

all: chrome firefox safari

patch:
	$(eval version=$(shell jq -r .version manifest.json))
	# increment the patch version (e.g., 1.0.0 -> 1.0.1)
	$(eval new_version=$(shell echo $(version) | awk -F. -v OFS=. '{$$NF++; print $$0}'))
	@echo "Bump version from $(version) to $(new_version)"
	# replace the version in manifest.json with the new version
	cat manifest.json | sed -E "s/\"version\": \"[0-9]+\.[0-9]+\.[0-9]+\"/\"version\": \"$(new_version)\"/" > manifest.json.tmp
	mv manifest.json.tmp manifest.json
	cat manifest.firefox.json | sed -E "s/\"version\": \"[0-9]+\.[0-9]+\.[0-9]+\"/\"version\": \"$(new_version)\"/" > manifest.json.tmp
	mv manifest.json.tmp manifest.firefox.json
	#$(MAKE) tag

minor:
	$(eval version=$(shell jq -r .version manifest.json))
	# increment the minor version (e.g., 1.0.0 -> 1.1.0)
	$(eval new_version=$(shell echo $(version) | awk -F. -v OFS=. '{$$(NF-1)++; $$NF=0; print $$0}'))
	@echo "Bump version from $(version) to $(new_version)"
	# replace the version in manifest.json with the new version
	cat manifest.json | sed -E "s/\"version\": \"[0-9]+\.[0-9]+\.[0-9]+\"/\"version\": \"$(new_version)\"/" > manifest.json.tmp
	mv manifest.json.tmp manifest.json
	cat manifest.firefox.json | sed -E "s/\"version\": \"[0-9]+\.[0-9]+\.[0-9]+\"/\"version\": \"$(new_version)\"/" > manifest.json.tmp
	mv manifest.json.tmp manifest.firefox.json
	#$(MAKE) tag

major:
	$(eval version=$(shell jq -r .version manifest.json))
	# increment the major version (e.g., 1.0.0 -> 2.0.0)
	$(eval new_version=$(shell echo $(version) | awk -F. -v OFS=. '{$$1++; $$2=0; $$3=0; print $$0}'))
	@echo "Bump version from $(version) to $(new_version)"
	# replace the version in manifest.json with the new version
	cat manifest.json | sed -E "s/\"version\": \"[0-9]+\.[0-9]+\.[0-9]+\"/\"version\": \"$(new_version)\"/" > manifest.json.tmp
	mv manifest.json.tmp manifest.json
	cat manifest.firefox.json | sed -E "s/\"version\": \"[0-9]+\.[0-9]+\.[0-9]+\"/\"version\": \"$(new_version)\"/" > manifest.json.tmp
	mv manifest.json.tmp manifest.firefox.json
	#$(MAKE) tag

tag: 
	$(eval version=$(shell jq -r .version manifest.json))
	git add manifest.json
	git commit -m "Bump version to $(version)"
	git push origin
	git tag $(version)
	git push origin $(version)

del-tag:
	$(eval version=$(shell jq -r .version manifest.json))
	git tag -d $(version)
	git push origin :refs/tags/$(version)
	