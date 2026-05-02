import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Last Watch",
    short_name: "Last Watch",
    description: "멸종위기 동물 학습 프로젝트",
    start_url: "/",
    display: "standalone",
    background_color: "#fafafa",
    theme_color: "#D81E05",
    orientation: "portrait",
    icons: [
      { src: "/favicon.ico", sizes: "any", type: "image/x-icon" },
    ],
  };
}
