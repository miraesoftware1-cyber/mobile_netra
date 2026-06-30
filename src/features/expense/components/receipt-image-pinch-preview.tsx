"use client";

import {
  TransformComponent,
  TransformWrapper,
} from "react-zoom-pan-pinch";

type ReceiptImagePinchPreviewProps = {
  imageUrl: string;
};

export function ReceiptImagePinchPreview({
  imageUrl,
}: ReceiptImagePinchPreviewProps) {
  return (
    <div className="relative h-[min(66vh,560px)] w-full overflow-hidden rounded-md bg-gray-50">
      <TransformWrapper
        key={imageUrl}
        initialScale={1}
        minScale={1}
        maxScale={5}
        centerOnInit
        limitToBounds
        pinch={{ step: 5 }}
        panning={{ velocityDisabled: false }}
        doubleClick={{ mode: "reset" }}
        wheel={{ step: 0.12 }}
      >
        <TransformComponent
          wrapperClass="!size-full"
          contentClass="!size-full flex items-center justify-center"
        >
          <img
            src={imageUrl}
            alt="영수증 이미지"
            className="max-h-[min(66vh,560px)] max-w-full select-none rounded-md object-contain"
            draggable={false}
          />
        </TransformComponent>
      </TransformWrapper>
    </div>
  );
}
