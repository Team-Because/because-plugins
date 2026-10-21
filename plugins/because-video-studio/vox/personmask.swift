import Foundation
import Vision
import CoreImage
// Apple Vision person segmentation, free and local (macOS 12+).
// usage: personmask <in_dir> <out_dir>
// Every .png or .jpg in in_dir -> <same name>.png in out_dir: 8-bit mask at the input's full size.
// Build: swiftc -O personmask.swift -o personmask
// Tip: when the speaker is small (wide stage shot) or turns away, run it on 2x upscaled crops
// around the tracked head instead of full frames (scripts/matte.py crops); Vision then finds them.
let args = CommandLine.arguments
if args.count < 3 { print("usage: personmask <in_dir> <out_dir>"); exit(1) }
let inDir = URL(fileURLWithPath: args[1]), outDir = URL(fileURLWithPath: args[2])
try? FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)
let ctx = CIContext()
let files = try FileManager.default.contentsOfDirectory(atPath: inDir.path)
  .filter { $0.hasSuffix(".png") || $0.hasSuffix(".jpg") }.sorted()
var done = 0
for f in files {
  autoreleasepool {
    guard let ci = CIImage(contentsOf: inDir.appendingPathComponent(f)) else { return }
    let req = VNGeneratePersonSegmentationRequest()
    req.qualityLevel = .accurate
    req.outputPixelFormat = kCVPixelFormatType_OneComponent8
    do { try VNImageRequestHandler(ciImage: ci).perform([req]) } catch { return }
    guard let buf = req.results?.first?.pixelBuffer else { return }
    let mask = CIImage(cvPixelBuffer: buf)
    let scaled = mask.transformed(by: CGAffineTransform(scaleX: ci.extent.width / mask.extent.width, y: ci.extent.height / mask.extent.height))
    let name = (f as NSString).deletingPathExtension + ".png"
    try? ctx.writePNGRepresentation(of: scaled, to: outDir.appendingPathComponent(name), format: .L8, colorSpace: CGColorSpaceCreateDeviceGray())
    done += 1
    if done % 100 == 0 { print("masked \(done)/\(files.count)") }
  }
}
print("masked \(done) of \(files.count)")
