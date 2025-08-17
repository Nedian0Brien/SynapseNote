.PHONY: image

IMAGE_NAME = appflowy-web-app
IMAGE_TAG = latest

build:
	pnpm install
	pnpm run build

image: build
	cp .env deploy/
	rm -rf deploy/dist
	cp -r dist deploy/
	docker build -t $(IMAGE_NAME):$(IMAGE_TAG) deploy