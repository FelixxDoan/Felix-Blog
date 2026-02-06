export const languages = ["en", "vi"] as const;
export type Lang = (typeof languages)[number];

export const ui = {
  en: {
    nav: {
      home: "Home",
      blog: "Blog",
      about: "About",
    },
    home: {
      title: "Hello",
      intro: "This is my tech blog. See posts at",
      blogLink: "Blog",
    },
    about: {
      title: "About Me",
      description: "Lorem ipsum dolor sit amet",
    },
  },
  vi: {
    nav: {
      home: "Trang chủ",
      blog: "Blog",
      about: "Giới thiệu",
    },
    home: {
      title: "Xin chào",
      intro: "Đây là blog kỹ thuật của tôi. Xem bài viết tại",
      blogLink: "Blog",
    },
    about: {
      title: "Về tôi",
      description: "Lorem ipsum dolor sit amet",
    },
  },
} as const;

export function isLang(value: string): value is Lang {
  return languages.includes(value as Lang);
}
