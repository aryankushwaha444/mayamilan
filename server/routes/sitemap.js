import express from "express";
import { SitemapStream, streamToPromise, EnumChangefreq } from "sitemap";
import { Readable } from "stream";
import BlogPost from "../models/BlogPost.js";

const router = express.Router();

const SITE_URL = process.env.CLIENT_URL || "https://mayamilan.vercel.app";

// Cache sitemap for 1 hour to reduce database load
let cachedSitemap = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

router.get("/sitemap.xml", async (req, res) => {
  try {
    // Return cached version if fresh
    if (cachedSitemap && Date.now() - cacheTimestamp < CACHE_DURATION) {
      res.header("Content-Type", "application/xml");
      res.header("Cache-Control", "public, max-age=3600");
      return res.send(cachedSitemap);
    }

    res.header("Content-Type", "application/xml");
    res.header("Cache-Control", "public, max-age=3600");

    const sitemap = new SitemapStream({ hostname: SITE_URL });

    // ═══════════════════════════════════════════
    // STATIC PAGES
    // ═══════════════════════════════════════════
    const staticPages = [
      {
        url: "/",
        changefreq: EnumChangefreq.DAILY,
        priority: 1.0,
        lastmod: new Date().toISOString(),
      },
      {
        url: "/about",
        changefreq: EnumChangefreq.MONTHLY,
        priority: 0.8,
        lastmod: new Date().toISOString(),
      },
      {
        url: "/safety",
        changefreq: EnumChangefreq.MONTHLY,
        priority: 0.8,
        lastmod: new Date().toISOString(),
      },
      {
        url: "/success-stories",
        changefreq: EnumChangefreq.WEEKLY,
        priority: 0.7,
        lastmod: new Date().toISOString(),
      },
      {
        url: "/blog",
        changefreq: EnumChangefreq.WEEKLY,
        priority: 0.8,
        lastmod: new Date().toISOString(),
      },
      {
        url: "/security-policy",
        changefreq: EnumChangefreq.YEARLY,
        priority: 0.5,
        lastmod: new Date().toISOString(),
      },
      {
        url: "/suggestion",
        changefreq: EnumChangefreq.YEARLY,
        priority: 0.4,
        lastmod: new Date().toISOString(),
      },
    ];

    staticPages.forEach((page) => sitemap.write(page));

    // ═══════════════════════════════════════════
    // DYNAMIC: BLOG POSTS
    // ═══════════════════════════════════════════
    const blogPosts = await BlogPost.find({ published: true })
      .select("slug updatedAt createdAt")
      .sort({ createdAt: -1 })
      .lean();

    blogPosts.forEach((post) => {
      sitemap.write({
        url: `/blog/${post.slug}`,
        lastmod: post.updatedAt || post.createdAt,
        changefreq: EnumChangefreq.WEEKLY,
        priority: 0.7,
      });
    });

    // ═══════════════════════════════════════════
    // FUTURE: Add more dynamic content here
    // ═══════════════════════════════════════════
    // Example: City landing pages
    // const cities = ["kathmandu", "pokhara", "lalitpur", "chitwan"];
    // cities.forEach((city) => {
    //   sitemap.write({
    //     url: `/dating-in-${city}`,
    //     changefreq: EnumChangefreq.MONTHLY,
    //     priority: 0.8,
    //   });
    // });

    // Example: Public success stories
    // const stories = await SuccessStory.find({ isPublic: true })...

    sitemap.end();

    const xml = await streamToPromise(Readable.from(sitemap));
    const xmlString = xml.toString();

    // Cache the result
    cachedSitemap = xmlString;
    cacheTimestamp = Date.now();

    res.send(xmlString);
  } catch (error) {
    console.error("Sitemap generation error:", error);
    res.status(500).send("Error generating sitemap");
  }
});

export default router;
