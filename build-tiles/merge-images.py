import os

import PIL
from PIL import Image
from PIL import ImageDraw 

'''
assumptions:
	- 16 images on directory
	- images of 1024x1024px
	- create 1 texture atlas of 4096x4096px

'''


'''class ImageTx:
	def __init__(self, width, height):
		self.width = width
		self.height = height
	
	def merge(self, images):
	'''	

#------------------------------------------------------------------------------
def main():
	list_of_images = []
	
	size = (4096,4096)             # size of the image to create
	im = Image.new('RGB', size) # create the image
	draw = ImageDraw.Draw(im)   # create a drawing object that is
	                            # used to draw on the new image
	
	
	input_directory = os.path.join(os.path.dirname(os.path.abspath(__file__)), "input/MERGE_test-diffuse")
	print "Input directory: %s" % (input_directory)
	
	image_list = os.listdir(input_directory)
	image_list.sort()
	x,y = 0,0
	for filename in image_list:
		file_path = os.path.join(input_directory,filename)
		try:
			
			atlas = Image.open(file_path)
			print "Merge image: %s" %(filename)
			width, height = atlas.size
		
			im.paste(atlas, (x,y,x+width,y+height))
		
			x = x + width
			if x >= size[0]:
				x = 0
				y = y + height
				
		except IOError:
			print "IOError: %s" % (file_path)
		
	
	del draw # I'm done drawing so I don't need this anymore
    
    # now, we tell the image to save as a PNG to the 
    # provided file-like object
	output_directory = os.path.join(os.path.dirname(os.path.abspath(__file__)), "output/merge")
	output_file_path = os.path.join(output_directory,"atlas.png")
	im.save(output_file_path, "PNG")
		
		
if __name__ == "__main__":
	main()
