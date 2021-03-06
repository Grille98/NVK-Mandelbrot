import { assertVulkan, InitializedArray } from "../utils.mjs"
import Handle from "./handle.mjs";

export default class SwapchainHandle extends Handle {
  constructor(owner, { renderPass, surface, width, height }) {
    super(owner);
    let swapchainCreateInfo = new VkSwapchainCreateInfoKHR();
    swapchainCreateInfo.surface = surface.vkSurface;
    swapchainCreateInfo.minImageCount = 2;
    swapchainCreateInfo.imageFormat = VK_FORMAT_B8G8R8A8_UNORM;
    swapchainCreateInfo.imageColorSpace = VK_COLOR_SPACE_SRGB_NONLINEAR_KHR;
    swapchainCreateInfo.imageExtent = new VkExtent2D({ width: width, height: height });
    swapchainCreateInfo.imageArrayLayers = 1;
    swapchainCreateInfo.imageUsage = VK_IMAGE_USAGE_COLOR_ATTACHMENT_BIT;
    swapchainCreateInfo.imageSharingMode = VK_SHARING_MODE_EXCLUSIVE;
    swapchainCreateInfo.queueFamilyIndexCount = 0;
    swapchainCreateInfo.pQueueFamilyIndices = null;
    swapchainCreateInfo.preTransform = VK_SURFACE_TRANSFORM_IDENTITY_BIT_KHR;
    swapchainCreateInfo.compositeAlpha = VK_COMPOSITE_ALPHA_OPAQUE_BIT_KHR;
    swapchainCreateInfo.presentMode = VK_PRESENT_MODE_FIFO_KHR;
    swapchainCreateInfo.clipped = true;
    swapchainCreateInfo.oldSwapchain = null;

    let swapchain = new VkSwapchainKHR();
    let result = vkCreateSwapchainKHR(this.device, swapchainCreateInfo, null, swapchain);
    assertVulkan(result);

    let swapchainImageCount = { $: 0 };
    vkGetSwapchainImagesKHR(this.device, swapchain, swapchainImageCount, null);
    let swapchainImages = new InitializedArray(VkImage, swapchainImageCount.$);
    vkGetSwapchainImagesKHR(this.device, swapchain, swapchainImageCount, swapchainImages)

    let swapImageViews = [];//new InitializedArray(VkImageView, swapchainImageCount.$);
    let framebuffers = [];

    for (let i = 0; i < swapchainImageCount.$; i++) {
      let imageViewCreateInfo = {
        image: swapchainImages[i],
      }
      swapImageViews[i] = owner.createImageView(imageViewCreateInfo);

      let framebufferCreateInfo = {
        renderPass: renderPass,
        imageView: swapImageViews[i],
        width: width,
        height: height,
      }
      framebuffers[i] = owner.createFramebuffer(framebufferCreateInfo);
    }

    this.vkSwapchain = swapchain;
    this.imageViews = swapImageViews;
    this.imageIndex = 0;
    this.framebuffers = framebuffers;
    this.imageCount = swapchainImageCount.$;
    this.width = width;
    this.height = height;
  }
  destroy() {
    this.super_destroy();
    for (let i = 0; i < this.imageCount; i++) {
      this.framebuffers[i].destroy();
      this.imageViews[i].destroy();
    }
    vkDestroySwapchainKHR(this.device, this.vkSwapchain, null);
  }
  getNextIndex(semaphore) {
    let imageIndex = { $: 0 };
    vkAcquireNextImageKHR(this.device, this.vkSwapchain, 1E5, semaphore.vkSemaphore, null, imageIndex);
    return this.imageIndex = imageIndex.$;
  }
  getNextFramebuffer(semaphore) {
    return this.framebuffers[this.getNextSwapchainIndex(this, semaphore)];
  }
  present(semaphore) {
    let presentInfoKHR = new VkPresentInfoKHR();
    presentInfoKHR.waitSemaphoreCount = 1;
    presentInfoKHR.pWaitSemaphores = [semaphore.vkSemaphore];
    presentInfoKHR.swapchainCount = 1;
    presentInfoKHR.pSwapchains = [this.vkSwapchain];
    presentInfoKHR.pImageIndices = new Uint32Array([this.imageIndex]);
    presentInfoKHR.pResults = null;

    vkQueuePresentKHR(this.owner.queue, presentInfoKHR);
  }

}