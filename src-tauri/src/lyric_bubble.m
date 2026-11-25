#import <AppKit/AppKit.h>

// A child panel can extend beyond the small transparent pet window while moving with it.
@interface KuroLyricView : NSView
@property(nonatomic, copy) NSAttributedString *lyric;
@property(nonatomic) NSRect textRect;
@property(nonatomic) BOOL tailOnRight;
@end

@implementation KuroLyricView
- (void)drawRect:(NSRect)dirty {
    CGFloat w = NSWidth(self.bounds), h = NSHeight(self.bounds);
    [NSGraphicsContext saveGraphicsState];
    if (!self.tailOnRight) {
        NSAffineTransform *mirror = [NSAffineTransform transform];
        [mirror translateXBy:w yBy:0];
        [mirror scaleXBy:-1 yBy:1];
        [mirror concat];
    }
    CGFloat l = 3, r = w - 15, b = 9, t = h - 3;
    CGFloat radius = MIN(13, (t - b) * .46);
    NSBezierPath *p = [NSBezierPath bezierPath];
    [p moveToPoint:NSMakePoint(l + radius, b)];
    [p lineToPoint:NSMakePoint(r - 17, b)];
    [p curveToPoint:NSMakePoint(w - 3, 4) controlPoint1:NSMakePoint(r - 9, b - 3) controlPoint2:NSMakePoint(r + 6, 4)];
    [p curveToPoint:NSMakePoint(r, b + 12) controlPoint1:NSMakePoint(r + 6, 9) controlPoint2:NSMakePoint(r + 1, b + 8)];
    [p appendBezierPathWithArcFromPoint:NSMakePoint(r, t) toPoint:NSMakePoint(l, t) radius:radius];
    [p appendBezierPathWithArcFromPoint:NSMakePoint(l, t) toPoint:NSMakePoint(l, b) radius:radius];
    [p appendBezierPathWithArcFromPoint:NSMakePoint(l, b) toPoint:NSMakePoint(r, b) radius:radius];
    [p closePath];
    NSColor *ink = [NSColor colorWithSRGBRed:.19 green:.16 blue:.20 alpha:1];
    [NSGraphicsContext saveGraphicsState];
    NSAffineTransform *offset = [NSAffineTransform transform];
    [offset translateXBy:0 yBy:-1.5];
    [offset concat];
    [[ink colorWithAlphaComponent:.28] setFill];
    [p fill];
    [NSGraphicsContext restoreGraphicsState];
    [[NSColor colorWithSRGBRed:1 green:.985 blue:.95 alpha:1] setFill];
    [p fill];
    [ink setStroke];
    p.lineWidth = 1.6;
    p.lineJoinStyle = NSLineJoinStyleRound;
    [p stroke];
    [NSGraphicsContext restoreGraphicsState];
    [self.lyric drawWithRect:self.textRect options:NSStringDrawingUsesLineFragmentOrigin | NSStringDrawingUsesFontLeading];
}
@end

@interface KuroLyricPanel : NSPanel
@property(nonatomic, weak) NSWindow *pet;
@property(nonatomic, copy) NSString *line;
- (void)placeBubble;
@end

@implementation KuroLyricPanel
- (BOOL)canBecomeKeyWindow { return NO; }
- (BOOL)canBecomeMainWindow { return NO; }

- (instancetype)initWithPet:(NSWindow *)pet {
    self = [super initWithContentRect:NSZeroRect
                             styleMask:NSWindowStyleMaskBorderless | NSWindowStyleMaskNonactivatingPanel
                               backing:NSBackingStoreBuffered defer:NO];
    if (!self) return nil;
    _pet = pet;
    self.opaque = NO;
    self.backgroundColor = NSColor.clearColor;
    self.hasShadow = NO;
    self.ignoresMouseEvents = YES;
    self.hidesOnDeactivate = NO;
    self.releasedWhenClosed = NO;
    self.animationBehavior = NSWindowAnimationBehaviorNone;
    self.collectionBehavior = NSWindowCollectionBehaviorFullScreenAuxiliary | NSWindowCollectionBehaviorIgnoresCycle;
    KuroLyricView *view = [[KuroLyricView alloc] initWithFrame:NSZeroRect];
    view.accessibilityElement = YES;
    view.accessibilityRole = NSAccessibilityStaticTextRole;
    view.accessibilityLabel = @"当前歌词";
    self.contentView = view;
    for (NSNotificationName name in @[NSWindowDidMoveNotification, NSWindowDidResizeNotification, NSWindowDidChangeScreenNotification]) {
        [NSNotificationCenter.defaultCenter addObserver:self selector:@selector(petGeometryChanged:) name:name object:pet];
    }
    return self;
}

- (void)petGeometryChanged:(NSNotification *)note {
    if (self.line.length) [self placeBubble];
}

- (void)placeBubble {
    NSWindow *pet = self.pet;
    NSScreen *screen = pet.screen ?: NSScreen.mainScreen;
    if (!screen || !pet) return;
    NSRect frame = pet.frame, work = NSInsetRect(screen.visibleFrame, 4, 4);
    CGFloat fontSize = MIN(16, MAX(12, NSHeight(frame) * .036));
    CGFloat maxText = MIN(214, MAX(146, NSWidth(frame) * .48));
    CGFloat leftTip = NSMinX(frame) + .32 * NSWidth(frame);
    CGFloat rightTip = NSMinX(frame) + .68 * NSWidth(frame);
    CGFloat leftRoom = leftTip - NSMinX(work), rightRoom = NSMaxX(work) - rightTip;
    // Choose against the maximum width so short and long lines stay on the same side.
    BOOL onLeft = leftRoom >= maxText + 40 || leftRoom >= rightRoom;
    CGFloat textLimit = MAX(20, MIN(maxText, (onLeft ? leftRoom : rightRoom) - 40));
    NSMutableParagraphStyle *style = [[NSMutableParagraphStyle alloc] init];
    style.alignment = NSTextAlignmentCenter;
    style.lineBreakMode = NSLineBreakByWordWrapping;
    NSAttributedString *lyric = [[NSAttributedString alloc] initWithString:self.line attributes:@{
        NSFontAttributeName: [NSFont systemFontOfSize:fontSize weight:NSFontWeightSemibold],
        NSForegroundColorAttributeName: [NSColor colorWithSRGBRed:.15 green:.13 blue:.16 alpha:1],
        NSParagraphStyleAttributeName: style
    }];
    CGFloat textWidth = MIN(textLimit, MAX(18, ceil(lyric.size.width) + 1));
    NSRect measured = [lyric boundingRectWithSize:NSMakeSize(textWidth, CGFLOAT_MAX)
                                          options:NSStringDrawingUsesLineFragmentOrigin | NSStringDrawingUsesFontLeading];
    CGFloat textHeight = MIN(ceil(NSHeight(measured)) + 1, NSHeight(work) - 26);
    NSSize size = NSMakeSize(textWidth + 40, textHeight + 26);
    CGFloat x = onLeft ? leftTip - size.width + 3 : rightTip - 3;
    CGFloat y = NSMinY(frame) + NSHeight(frame) * .63 - 4;
    x = MIN(MAX(NSMinX(work), x), NSMaxX(work) - size.width);
    y = MIN(MAX(NSMinY(work), y), NSMaxY(work) - size.height);
    [self setFrame:NSMakeRect(round(x), round(y), size.width, size.height) display:NO];
    KuroLyricView *view = (KuroLyricView *)self.contentView;
    view.tailOnRight = onLeft;
    view.textRect = NSMakeRect(onLeft ? 14 : 26, 16, textWidth, textHeight);
    view.lyric = lyric;
    view.accessibilityValue = self.line;
    view.needsDisplay = YES;
}
@end

void kuro_set_lyric_bubble(NSWindow *pet, const char *text) {
    static KuroLyricPanel *panel;
    NSString *line = [NSString stringWithUTF8String:text];
    if (panel && panel.pet != pet) {
        [panel.parentWindow removeChildWindow:panel];
        [panel orderOut:nil];
        panel = nil;
    }
    if (!line.length) {
        panel.line = nil;
        if (panel.parentWindow) [pet removeChildWindow:panel];
        [panel orderOut:nil];
        return;
    }
    if (!panel) panel = [[KuroLyricPanel alloc] initWithPet:pet];
    panel.line = line;
    [panel placeBubble];
    if (!panel.parentWindow) [pet addChildWindow:panel ordered:NSWindowAbove];
}
